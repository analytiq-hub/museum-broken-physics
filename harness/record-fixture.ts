// `node harness/record-fixture.ts`: plays the sideways-gravity room in first
// person in headless Chrome (real WASD key presses, aiming and clicking console
// buttons, in real time) and saves the session to tests/replays/. The replay
// test then proves browser and Node agree on the ball *and* the player.
// Real playtest recordings (Shift+D in the game) go in the same folder.
//
// (tests/replays/sideways-gravity-window.json is an older fixture recorded
// from the window view, before first person; it stays as a regression test.)
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";
import type { GameDebugApi } from "../src/debug/api";

const OUT = "tests/replays/sideways-gravity-first-person.json";

type Snapshot = { state: ReturnType<GameDebugApi["getState"]>; player: ReturnType<GameDebugApi["getPlayer"]> };

const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => ({ state: window.__game!.getState(), player: window.__game!.getPlayer() }));

async function until(page: Page, what: string, test: (s: Snapshot) => boolean): Promise<void> {
  for (let i = 0; i < 900; i++) {
    if (test(await snap(page))) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

/** Holds W facing `yaw` until `arrived` is true. */
async function walk(page: Page, yaw: number, what: string, arrived: (s: Snapshot) => boolean): Promise<void> {
  await page.evaluate((y) => window.__game!.setLook(y, -0.1), yaw);
  await page.keyboard.down("w");
  try {
    await until(page, what, arrived);
  } finally {
    await page.keyboard.up("w");
  }
}

/** Aims at a console button and clicks it, checking the crosshair was on it. */
async function press(page: Page, direction: string): Promise<void> {
  await page.evaluate((d) => window.__game!.lookAtButton(d), direction);
  await page.evaluate(() => window.__game!.nextFrame()); // hover updates in the frame loop
  const hovered = (await snap(page)).player.hovered;
  if (hovered !== direction) throw new Error(`aimed at ${direction} but the crosshair is on ${hovered}`);
  await page.mouse.click(600, 400);
}

const WEST = Math.PI / 2;
const EAST = -Math.PI / 2;

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(`${url}?automation`);
  await page.waitForFunction(() => window.__game?.ready === true);

  // Attempt 1: walk to the console, back wall → left wall → floor, walk out the door.
  await walk(page, 0, "reach the console", (s) => s.player.feet.z < 3.6);
  await press(page, "north");
  await until(page, "ball settles at the back wall", (s) => s.state.settled && s.state.changesUsed === 1);
  await press(page, "west");
  await until(page, "ball settles in the corner", (s) => s.state.settled && s.state.changesUsed === 2);
  await press(page, "down");
  await until(page, "solved", (s) => s.state.solved);
  await until(page, "door open", (s) => s.state.bodies.door.pos[1] < -1.5);
  await walk(page, Math.atan2(6, 1.5), "approach the door", (s) => s.player.feet.x < -5);
  await walk(page, WEST, "leave through the exit corridor", (s) => s.player.feet.x < -9.6);

  // Attempt 2: reset, walk back to the console, drop the ball straight away (fails, auto-resets).
  await page.keyboard.press("r");
  await walk(page, EAST, "back into the gallery", (s) => s.player.feet.x > -1.5);
  await walk(page, Math.atan2(-1.5, -1.6), "back to the console", (s) => s.player.feet.z > 3.4 && s.player.feet.x > -0.4);
  await press(page, "down");
  await until(page, "failed", (s) => s.state.failed);
  await until(page, "auto-reset", (s) => !s.state.failed && s.state.changesUsed === 0);

  const recording = await page.evaluate(() => window.__game!.getRecording());
  writeFileSync(OUT, `${JSON.stringify(recording)}\n`);
  for (const a of recording.attempts) {
    const end = a.player?.end?.position;
    console.log(
      `${a.outcome.padEnd(8)} ${a.changes.map((c) => `${String(c.value)}@${c.step}`).join(", ")} → step ${a.endStep}, ` +
        `${a.inputs?.length ?? 0} input changes, player ends at ${end ? `${end.x.toFixed(2)}, ${end.z.toFixed(2)}` : "?"}`,
    );
  }
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  await server.close();
}
