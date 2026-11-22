// `node harness/record-fixture.ts`: plays the sideways-gravity room in headless
// Chrome with real key presses, in real time, and saves the session recording
// to tests/replays/. Regenerates the replay fixture that proves browser and
// Node simulations stay identical. Real playtest recordings (Shift+D in the
// game) go in the same folder.
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";
import type { ExhibitState } from "../src/exhibits/Exhibit";

const OUT = "tests/replays/sideways-gravity-fixture.json";

const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");
const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

const state = (page: Page) => page.evaluate(() => window.__game!.getState());
async function until(page: Page, what: string, test: (s: ExhibitState) => boolean): Promise<void> {
  for (let i = 0; i < 600; i++) {
    if (test(await state(page))) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`timed out waiting for: ${what}`);
}

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(url);
  await page.waitForFunction(() => window.__game?.ready === true);

  // Attempt 1: back wall, left wall, then floor *while the ball is still flying*
  // (it lands on the ledge short of the plate), then left wall again to slide it on.
  await page.keyboard.press("ArrowUp");
  await until(page, "ball settles at the back wall", (s) => s.settled && s.changesUsed === 1);
  await page.keyboard.press("ArrowLeft");
  await until(page, "ball past the middle", (s) => s.bodies.ball.pos[0] < 0);
  await page.keyboard.press(" ");
  await until(page, "ball lands on the ledge", (s) => s.settled && s.changesUsed === 3);
  if (!(await state(page)).solved) await page.keyboard.press("ArrowLeft");
  await until(page, "solved", (s) => s.solved);

  // Attempt 2: straight to the floor, a failure; the game resets itself.
  await page.keyboard.press("r");
  await page.keyboard.press(" ");
  await until(page, "failed", (s) => s.failed);
  await until(page, "auto-reset", (s) => !s.failed && s.changesUsed === 0);

  const recording = await page.evaluate(() => window.__game!.getRecording());
  writeFileSync(OUT, `${JSON.stringify(recording, null, 2)}\n`);
  for (const a of recording.attempts) {
    console.log(`${a.outcome.padEnd(11)} ${a.changes.map((c) => `${String(c.value)}@${c.step}`).join(", ")} → end step ${a.endStep}`);
  }
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  await server.close();
}
