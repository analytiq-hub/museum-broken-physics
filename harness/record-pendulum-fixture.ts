// `node harness/record-pendulum-fixture.ts`: plays the pendulum gallery in
// headless Chrome in real time (jump there, wait for the high bell, set heavy
// drag through the debug API, wait for rest) and saves the recording to
// tests/replays/. Exercises the "player arrived from another gallery" sync.
import { writeFileSync } from "node:fs";
import { chromium, type Page } from "playwright-core";
import { createServer } from "vite";

const OUT = "tests/replays/pendulum-fixture.json";
const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");
const browser = await chromium.launch({ channel: "chrome", args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });

async function until(page: Page, what: string, test: () => boolean): Promise<void> {
  await page.waitForFunction(test, undefined, { timeout: 600_000, polling: 100 }).catch(() => {
    throw new Error(`timed out waiting for: ${what}`);
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
  await page.goto(`${url}?automation&quality=low`);
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 60_000 });
  await page.evaluate(() => window.__game!.setCamera("pendulum")); // jumps the player into Gallery II
  await until(page, "the high bell", () => window.__game!.getState().exhibit === "pendulum" && (window.__game!.getState().bodies.bob.pos[2] ?? 0) !== 0 && document.querySelector(".hud")!.textContent!.includes("high bell"));
  await page.evaluate(() => window.__game!.setRule("damping", 0.4));
  await until(page, "solved", () => window.__game!.getState().solved);
  const recording = await page.evaluate(() => window.__game!.getRecording());
  writeFileSync(OUT, `${JSON.stringify(recording)}\n`);
  for (const a of recording.attempts) {
    console.log(`${a.outcome}: ${a.changes.map((c) => `${String(c.value)}@${c.step}`).join(", ")} → step ${a.endStep}, ${a.syncs?.length ?? 0} arrival sync(s)`);
  }
  console.log(`wrote ${OUT}`);
} finally {
  await browser.close();
  await server.close();
}
