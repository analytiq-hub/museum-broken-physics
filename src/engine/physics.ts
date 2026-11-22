// Simulation-side engine code. Must not import three.js or touch the DOM:
// everything here also runs headlessly in Node (vitest, the puzzle solver).
import RAPIER from "@dimforge/rapier3d-compat";

/** Fixed physics timestep, in seconds (60 Hz). */
export const FIXED_DT = 1 / 60;

let ready: Promise<typeof RAPIER> | undefined;

/** Loads Rapier's WASM once. Await before creating any world. */
export function initPhysics(): Promise<typeof RAPIER> {
  ready ??= RAPIER.init().then(() => RAPIER);
  return ready;
}

/** Creates a world with the fixed timestep and the given gravity. */
export function createWorld(
  R: typeof RAPIER,
  gravity: { x: number; y: number; z: number } = { x: 0, y: -9.81, z: 0 },
): RAPIER.World {
  const world = new R.World(gravity);
  world.timestep = FIXED_DT;
  return world;
}
