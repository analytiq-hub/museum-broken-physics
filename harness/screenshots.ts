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
  /** An orbit pose name, or omit and give `player` for first person. */
  camera?: string;
  /** First person: floor position and look direction (radians; yaw 0 = north, +π/2 = west). */
  player?: { x: number; z: number; yaw: number; pitch: number };
  moves: string[];
  /** Extra steps after the last move settles (e.g. for the door to open). */
  extraSteps?: number;
  /** First person: hold up the physics instrument. */
  instrument?: boolean;
  /** After `moves`: wait a number of steps, or set a rule. */
  actions?: ({ wait: number } | { rule: string; value: unknown })[];
}

const S = 60; // steps per second

const SHOTS: Shot[] = [
  { name: "01-start", camera: "window", moves: [] },
  { name: "02-start-overview", camera: "overview", moves: [] },
  { name: "03-after-back-wall", camera: "window", moves: ["north"] },
  { name: "04-after-left-wall", camera: "window", moves: ["north", "west"] },
  { name: "05-solved", camera: "window", moves: ["north", "west", "down"], extraSteps: 120 },
  { name: "06-solved-ledge", camera: "ledge", moves: ["north", "west", "down"], extraSteps: 120 },
  { name: "07-failed-just-floor", camera: "window", moves: ["down"] },
  { name: "08-failed-overview", camera: "overview", moves: ["north", "down"] },
  // First person.
  { name: "10-fp-spawn", player: { x: 0, z: 7.6, yaw: 0, pitch: -0.08 }, moves: [] },
  { name: "11-fp-at-console", player: { x: 0, z: 3.7, yaw: 0, pitch: -0.36 }, moves: [] },
  { name: "12-fp-room-from-console", player: { x: 0, z: 3.5, yaw: 0, pitch: 0.3 }, moves: [] },
  { name: "14-fp-instrument", player: { x: 0, z: 3.6, yaw: 0, pitch: 0.15 }, moves: [], instrument: true },
  { name: "15-fp-instrument-spent", player: { x: 0, z: 3.6, yaw: 0, pitch: 0.15 }, moves: ["north", "south", "east", "west"], instrument: true },
  // Gallery II: the Restless Pendulum.
  { name: "20-pendulum-start", camera: "pendulum", moves: [] },
  { name: "21-pendulum-both-bells", camera: "pendulum", moves: [], actions: [{ wait: 24 * S }] },
  { name: "22-pendulum-solved", camera: "pendulum-low", moves: [], actions: [{ wait: 25 * S }, { rule: "damping", value: 0.4 }, { wait: 30 * S }] },
  { name: "23-pendulum-vase-broken", camera: "pendulum-low", moves: [], actions: [{ wait: 32 * S }] },
  { name: "24-fp-pendulum-entrance", player: { x: -16, z: 2, yaw: Math.PI / 2 + 0.25, pitch: 0.3 }, moves: [], actions: [{ wait: 22 * S }] },
  { name: "25-fp-pendulum-instrument", player: { x: -16, z: 2, yaw: Math.PI / 2 + 0.25, pitch: 0.3 }, moves: [], instrument: true },
  // Gallery III: the Leaning Pendulum.
  { name: "30-leaning-start", camera: "leaning", moves: [] },
  { name: "31-leaning-bell", camera: "leaning", moves: [], actions: [{ wait: 10.6 * S }] },
  {
    name: "32-leaning-tilting",
    camera: "leaning-low",
    moves: [],
    actions: [{ wait: 11 * S }, { rule: "damping", value: 0.4 }, { wait: 10 * S }, { rule: "gravity", value: "north-down" }, { wait: 1 * S }],
  },
  {
    name: "33-leaning-solved",
    camera: "leaning-low",
    moves: [],
    actions: [
      { wait: 11 * S },
      { rule: "damping", value: 0.4 },
      { wait: 10 * S },
      { rule: "gravity", value: "north-down" },
      { wait: 14 * S },
      { rule: "gravity", value: "down" },
      { wait: 14 * S },
    ],
  },
  { name: "34-leaning-torn-loose", camera: "leaning-low", moves: [], actions: [{ rule: "gravity", value: "down" }, { wait: 1.2 * S }] },
  { name: "35-fp-leaning-entrance", player: { x: -35, z: 2, yaw: Math.PI / 2 - 0.35, pitch: 0.45 }, moves: [] },
  { name: "36-fp-leaning-instrument", player: { x: -35, z: 2, yaw: Math.PI / 2 - 0.35, pitch: 0.45 }, moves: [], instrument: true },
  { name: "13-fp-solved-door", player: { x: -3, z: 2, yaw: Math.PI / 2, pitch: 0 }, moves: ["north", "west", "down"], extraSteps: 120 },
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
    await page.goto(`${url}?automation&paused`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 30_000 });
    const state = await page.evaluate(async (s: Shot) => {
      const game = window.__game as GameDebugApi;
      if (s.player) game.setPlayer({ x: s.player.x, z: s.player.z }, s.player.yaw, s.player.pitch);
      else game.setCamera(s.camera ?? "window");
      if (s.instrument) game.setInstrument(true);
      for (const move of s.moves) {
        game.setRule("gravity", move);
        game.settle();
      }
      for (const a of s.actions ?? []) {
        if ("wait" in a) game.step(a.wait);
        else game.setRule(a.rule, a.value);
      }
      game.step(s.extraSteps ?? 60);
      await game.nextFrame();
      return game.getState();
    }, shot);
    const file = `${OUT}/${shot.name}.png`;
    await page.screenshot({ path: file });
    const outcome = `${state.exhibit}: ${state.solved ? "solved" : state.failed ? "failed" : "in progress"}`;
    const hovered = await page.evaluate(() => window.__game!.getPlayer().hovered);
    console.log(
      `${file}  [${shot.moves.join(" → ") || "no moves"}] ${outcome}, ${Object.keys(state.bodies)[0]} at ${Object.values(state.bodies)[0].pos.join(", ")}${hovered ? `, looking at "${hovered}"` : ""}`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
