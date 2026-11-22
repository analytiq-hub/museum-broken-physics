import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { FIXED_DT, initPhysics } from "../../src/engine/physics";
import { CUBE_HALF_SIZE, buildFallingCubeSim } from "../../src/exhibits/falling-cube/sim";

let R: typeof RAPIER;

beforeAll(async () => {
  R = await initPhysics();
});

/** Builds the scene, steps it `steps` times, and returns the cube's final position. */
function runCubeFor(steps: number): number[] {
  const { world, cube } = buildFallingCubeSim(R);
  for (let i = 0; i < steps; i++) world.step();
  const p = cube.translation();
  world.free();
  return [p.x, p.y, p.z];
}

describe("falling cube (headless)", () => {
  it("comes to rest on the floor", () => {
    const { world, cube } = buildFallingCubeSim(R);

    const maxSteps = 10 / FIXED_DT; // 10 simulated seconds
    let steps = 0;
    while (!cube.isSleeping() && steps < maxSteps) {
      world.step();
      steps++;
    }

    expect(cube.isSleeping(), `cube still moving after ${steps} steps`).toBe(true);

    // Resting on a face: centre is one half-size above the floor (y = 0).
    expect(cube.translation().y).toBeCloseTo(CUBE_HALF_SIZE, 1);
    const v = cube.linvel();
    expect(Math.hypot(v.x, v.y, v.z)).toBeLessThan(0.01);

    world.free();
  });

  it("is deterministic: two runs end in the same place", () => {
    expect(runCubeFor(300)).toEqual(runCubeFor(300));
  });

  it("snapshot/restore resets the cube to its start position", () => {
    const { world, cube } = buildFallingCubeSim(R);
    const snapshot = world.takeSnapshot();
    const startY = cube.translation().y;

    for (let i = 0; i < 120; i++) world.step();
    expect(cube.translation().y).toBeLessThan(startY);

    const restored = R.World.restoreSnapshot(snapshot);
    const restoredCube = restored.getRigidBody(cube.handle);
    expect(restoredCube.translation().y).toBeCloseTo(startY, 5);

    world.free();
    restored.free();
  });
});

describe("sim/view split", () => {
  // Simulation code must run in Node, so it may not import three.js.
  const simFiles = [
    "src/engine/physics.ts",
    ...readdirSync("src/exhibits").map((d) => join("src/exhibits", d, "sim.ts")),
  ];

  it.each(simFiles)("%s does not import three.js", (file) => {
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/from\s+["']three(\/|["'])/);
  });
});
