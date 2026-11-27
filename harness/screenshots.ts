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
  /**
   * First person: floor position in `room`'s own coordinates (default: the first two rooms,
   * which sit at their own coordinates) and look direction (radians; yaw 0 = north, +π/2 = west).
   */
  player?: { x: number; y?: number; z: number; yaw: number; pitch: number; room?: string };
  moves: string[];
  /** Extra steps after the last move settles (e.g. for the door to open). */
  extraSteps?: number;
  /** First person: hold up the physics instrument. */
  instrument?: boolean;
  /** Real seconds to let the view animate before the shot (the Chladni sand settles in real time). */
  viewSeconds?: number;
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
  { name: "35-fp-leaning-entrance", player: { x: -35, z: 2, yaw: Math.PI / 2 - 0.35, pitch: 0.45, room: "leaning-pendulum" }, moves: [] },
  { name: "36-fp-leaning-instrument", player: { x: -35, z: 2, yaw: Math.PI / 2 - 0.35, pitch: 0.45, room: "leaning-pendulum" }, moves: [], instrument: true },
  // Gallery IV: the Hidden Door.
  { name: "40-optics-start", camera: "optics", moves: [] },
  { name: "41-optics-door-revealed", camera: "optics-door", moves: [] },
  { name: "42-optics-index-fixed", camera: "optics", moves: [], actions: [{ rule: "index", value: 1.5 }] },
  { name: "43-optics-solved", camera: "optics", moves: [], actions: [{ rule: "index", value: 1.5 }, { rule: "mirror-b", value: 120 }, { wait: 3 * S }] },
  { name: "44-fp-optics-entrance", player: { x: -53.8, z: 2, yaw: Math.PI / 2 + 0.2, pitch: -0.12, room: "optics" }, moves: [] },
  { name: "45-fp-optics-instrument", player: { x: -53.8, z: 2, yaw: Math.PI / 2 + 0.2, pitch: -0.12, room: "optics" }, moves: [], instrument: true },
  { name: "70-bouncing-start", camera: "bouncing", moves: [] },
  { name: "71-bouncing-climbing", camera: "bouncing", moves: [], actions: [{ rule: "lever", value: "pulled" }, { wait: 9 * S }] },
  { name: "72-bouncing-balcony", camera: "bouncing-balcony", moves: [], actions: [{ rule: "lever", value: "pulled" }, { wait: 13.4 * S }] },
  { name: "73-bouncing-solved", camera: "bouncing", moves: [], actions: [{ rule: "lever", value: "pulled" }, { wait: 13.4 * S }, { rule: "bounce", value: 0.6 }, { wait: 4 * S }] },
  { name: "74-fp-bouncing-entrance", player: { x: -72.6, z: 1.8, yaw: Math.PI / 2 - 0.35, pitch: 0.12, room: "bouncing" }, moves: [] },
  { name: "75-fp-bouncing-lever", player: { x: -78.9, z: 0.1, yaw: 0.85, pitch: -0.1, room: "bouncing" }, moves: [] },
  { name: "93-chladni-start", camera: "chladni", moves: [] },
  { name: "94-chladni-broken-key3", camera: "chladni-plate", moves: [], actions: [{ rule: "note", value: "2" }], viewSeconds: 5 },
  { name: "95-chladni-lock-figure", camera: "chladni-plate", moves: [], actions: [{ rule: "brass-speed", value: 3500 }, { rule: "note", value: "2" }], extraSteps: 150, viewSeconds: 5 },
  { name: "96-chladni-solved", camera: "chladni", moves: [], actions: [{ rule: "brass-speed", value: 3500 }, { rule: "note", value: "2" }, { wait: 300 }] },
  { name: "97-fp-chladni-console", player: { x: -5.5, z: 1.4, yaw: 0, pitch: -0.55, room: "chladni" }, moves: [] },
  { name: "A0-furnace-start", camera: "furnace", moves: [] },
  { name: "A1-furnace-stove-glowing", camera: "furnace", moves: [], actions: [{ wait: 35 * S }] },
  { name: "A2-furnace-ice-melting", camera: "furnace-ice", moves: [], actions: [{ rule: "mirror", value: "ice" }, { wait: 6.5 * S }] },
  { name: "A3-furnace-boiling", camera: "furnace-ice", moves: [], actions: [{ rule: "mirror", value: "ice" }, { wait: 15 * S }] },
  { name: "A4-furnace-solved", camera: "furnace", moves: [], actions: [{ rule: "mirror", value: "ice" }, { wait: 10 * S }, { rule: "heat", value: "hot-to-cold" }, { wait: 2 * S }] },
  { name: "B0-double-slit-start", camera: "double-slit", moves: [] },
  { name: "B1-double-slit-screen-broken", camera: "double-slit-screen", moves: [] },
  { name: "B2-double-slit-wavelength-only", camera: "double-slit-screen", moves: [], actions: [{ rule: "wavelength", value: 589 }] },
  { name: "B3-double-slit-solved", camera: "double-slit-screen", moves: [], actions: [{ rule: "wavelength", value: 589 }, { rule: "index", value: 1.33 }, { wait: 3 * S }] },
  { name: "B4-double-slit-observed", camera: "double-slit-screen", moves: [], actions: [{ rule: "wavelength", value: 589 }, { rule: "index", value: 1.33 }, { rule: "observer", value: "on" }] },
  { name: "C0-upper-stair", camera: "upper-stair", moves: [] },
  { name: "C1-rutherford-start", camera: "rutherford", moves: [], actions: [{ wait: 6 * S }] },
  { name: "C2-rutherford-pudding", camera: "rutherford-table", moves: [], actions: [{ rule: "source", value: "6" }, { wait: 6 * S }] },
  { name: "C3-rutherford-nucleus-near", camera: "rutherford-table", moves: [], actions: [{ rule: "charge", value: "nucleus" }, { rule: "source", value: "5" }, { wait: 6 * S }] },
  { name: "C4-rutherford-solved", camera: "rutherford-table", moves: [], actions: [{ rule: "charge", value: "nucleus" }, { rule: "source", value: "6" }, { wait: 9 * S }] },
  { name: "D0-stern-gerlach-start", camera: "stern-gerlach", moves: [] },
  { name: "D1-stern-gerlach-smear", camera: "stern-gerlach-screen", moves: [], actions: [{ rule: "oven", value: "on" }, { wait: 8 * S }] },
  { name: "D2-stern-gerlach-solved", camera: "stern-gerlach-screen", moves: [], actions: [{ rule: "spin", value: "two" }, { rule: "oven", value: "on" }, { wait: 3 * S }] },
  { name: "D3-stern-gerlach-beam", camera: "stern-gerlach", moves: [], actions: [{ rule: "spin", value: "two" }, { rule: "oven", value: "on" }, { wait: 1 * S }] },
  { name: "E0-tunnel-start", camera: "tunnel", moves: [] },
  { name: "E1-tunnel-spreading", camera: "tunnel-case", moves: [], actions: [{ rule: "lever", value: "pulled" }, { wait: 5 * S }] },
  { name: "E2-tunnel-solved", camera: "tunnel-case", moves: [], actions: [{ rule: "lever", value: "pulled" }, { wait: 5 * S }, { rule: "planck", value: 0 }, { wait: 2 * S }] },
  { name: "F0-slow-light-start", camera: "slow-light", moves: [] },
  // Fired at 1.0 s, seen 1.2 s later: the flash is 4.8 m down the bench.
  { name: "F1-slow-light-crawling", camera: "slow-light-bench", moves: [], actions: [{ wait: 1 * S }, { rule: "lamp", value: "1" }, { wait: 1.2 * S }], extraSteps: 0 },
  { name: "F2-slow-light-apart", camera: "slow-light-bench", moves: [], actions: [{ wait: 1.2 * S }, { rule: "lamp", value: "1" }, { wait: 2.5 * S }] },
  { name: "F3-slow-light-solved", camera: "slow-light-bench", moves: [], actions: [{ rule: "light", value: "true" }, { wait: 3.1 * S }, { rule: "lamp", value: "1" }, { wait: 0.3 * S }] },
  { name: "G0-galileo-start", camera: "galileo", moves: [] },
  { name: "G1-galileo-flight", camera: "galileo-flight", moves: [], actions: [{ rule: "kicker", value: "fired" }, { wait: 0.45 * S }], extraSteps: 0 },
  { name: "G2-galileo-in-pans", camera: "galileo", moves: [], actions: [{ rule: "kicker", value: "fired" }, { wait: 3 * S }] },
  { name: "G3-galileo-solved", camera: "galileo", moves: [], actions: [{ rule: "kicker", value: "fired" }, { wait: 3 * S }, { rule: "fall", value: "same" }, { wait: 2 * S }] },
  { name: "90-stairwell", camera: "stairwell", moves: [] },
  { name: "91-fp-stair-foot", player: { x: -1.0, z: 2, yaw: Math.PI / 2, pitch: 0.18, room: "stairwell" }, moves: [] },
  { name: "92-fp-stair-landing", player: { x: -10.9, y: 4.8, z: 1.3, yaw: Math.PI, pitch: 0.02, room: "stairwell" }, moves: [] },
  { name: "80-singing-start", camera: "singing", moves: [] },
  { name: "81-singing-harmonica-cracked", camera: "singing-harmonica", moves: [], actions: [{ rule: "pipe", value: "3" }, { wait: 1.3 * S }] },
  { name: "82-singing-harmonica-broken", camera: "singing", moves: [], actions: [{ rule: "pipe", value: "3" }, { wait: 3 * S }] },
  { name: "83-singing-pane-cracked", camera: "singing-pane", moves: [], actions: [{ rule: "speed", value: 343 }, { rule: "pipe", value: "2" }, { wait: 4 * S }] },
  { name: "84-singing-solved", camera: "singing", moves: [], actions: [{ rule: "speed", value: 343 }, { rule: "pipe", value: "2" }, { wait: 8 * S }] },
  { name: "85-fp-singing-entrance", player: { x: -93.6, z: 2, yaw: Math.PI / 2 - 0.3, pitch: -0.05, room: "singing-glass" }, moves: [] },
  { name: "86-fp-singing-organ", player: { x: -96.8, z: -1.2, yaw: 0.25, pitch: -0.15, room: "singing-glass" }, moves: [] },
  {
    name: "46-fp-alcove",
    player: { x: -61.5, z: 1.8, yaw: Math.PI / 2, pitch: 0, room: "optics" },
    moves: [],
    actions: [{ rule: "index", value: 1.5 }, { rule: "mirror-b", value: 120 }, { wait: 3 * S }],
  },
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

  // `node harness/screenshots.ts 7` takes only the shots whose names start with "7".
  const only = process.argv[2];
  for (const shot of SHOTS.filter((sh) => !only || sh.name.startsWith(only))) {
    await page.goto(`${url}?automation&paused`);
    await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 30_000 });
    const state = await page.evaluate(async (s: Shot) => {
      const game = window.__game as GameDebugApi;
      if (s.player) await game.setPlayerIn(s.player.room ?? (s.player.x > -14.5 ? "sideways-gravity" : "pendulum"), { x: s.player.x, y: s.player.y, z: s.player.z }, s.player.yaw, s.player.pitch);
      else await game.setCamera(s.camera ?? "window");
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
      if (s.viewSeconds) await new Promise((resolve) => setTimeout(resolve, s.viewSeconds! * 1000));
      await game.nextFrame();
      return game.getState();
    }, shot);
    const file = `${OUT}/${shot.name}.png`;
    await page.screenshot({ path: file });
    const outcome = `${state.exhibit}: ${state.solved ? "solved" : state.failed ? "failed" : "in progress"}`;
    const hovered = await page.evaluate(() => window.__game!.getPlayer().hovered);
    const body = Object.entries(state.bodies)[0]; // passages (the stairs) have none
    console.log(
      `${file}  [${shot.moves.join(" → ") || "no moves"}] ${outcome}${body ? `, ${body[0]} at ${body[1].pos.join(", ")}` : ""}${hovered ? `, looking at "${hovered}"` : ""}`,
    );
  }
} finally {
  await browser.close();
  await server.close();
}
