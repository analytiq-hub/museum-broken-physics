// `npm run screenshots`: drives the real build in headless Chrome through
// window.__game and saves screenshots of set states to harness/out/screens/.
// Runs directly under Node (type stripping), using the system Chrome install.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { createServer } from "vite";
import type { GameDebugApi } from "../src/debug/api";

const OUT = "harness/out/screens";

interface Shot {
  name: string;
  camera: string;
  moves: string[];
  /** Extra steps after the last move settles (e.g. for the door to open). */
  extraSteps?: number;
}

const SHOTS: Shot[] = [
  { name: "01-start", camera: "window", moves: [] },
  { name: "02-start-overview", camera: "overview", moves: [] },
  { name: "03-after-back-wall", camera: "window", moves: ["north"] },
  { name: "04-after-left-wall", camera: "window", moves: ["north", "west"] },
  { name: "05-solved", camera: "window", moves: ["north", "west", "down"], extraSteps: 120 },
  { name: "06-solved-ledge", camera: "ledge", moves: ["north", "west", "down"], extraSteps: 120 },
  { name: "07-failed-just-floor", camera: "window", moves: ["down"] },
  { name: "08-failed-overview", camera: "overview", moves: ["north", "down"] },
];

mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 0 }, logLevel: "error" });
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("vite server has no local URL");

const browser = await chromium.launch({
  channel: "chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  page.on("pageerror", (e) => console.error("page error:", e.message));

  for (const shot of SHOTS) {
    await page.goto(`${url}?paused`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 30_000 });
    const state = await page.evaluate(async (s: Shot) => {
      const game = window.__game as GameDebugApi;
      game.setCamera(s.camera);
      for (const move of s.moves) {
        game.setRule("gravity", move);
        game.settle();
      }
      game.step(s.extraSteps ?? 60);
      await game.nextFrame();
      return game.getState();
    }, shot);
    const file = `${OUT}/${shot.name}.png`;
    await page.screenshot({ path: file });
    const outcome = state.solved ? "solved" : state.failed ? "failed" : "in progress";
    console.log(`${file}  [${shot.moves.join(" → ") || "no moves"}] ${outcome}, ball at ${state.bodies.ball.pos.join(", ")}`);
  }
} finally {
  await browser.close();
  await server.close();
}
