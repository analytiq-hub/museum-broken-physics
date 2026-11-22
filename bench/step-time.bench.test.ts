// Physics step-time benchmark. Run with `npm run bench` (part of `npm run check`).
// Fails if a physics step exceeds its budget, so performance regressions surface
// before they reach a browser. Budgets are generous to tolerate slow CI machines.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { createWorld, initPhysics } from "../src/engine/physics";
import { buildFallingCubeSim } from "../src/exhibits/falling-cube/sim";

/** A 16.7 ms frame must also fit rendering; physics gets at most a quarter of it. */
const STEP_BUDGET_MS = 4;
const STEPS = 600; // 10 simulated seconds

let R: typeof RAPIER;
beforeAll(async () => {
  R = await initPhysics();
});

/** Steps `world` STEPS times and returns the mean and worst step time in ms. */
function measure(world: RAPIER.World): { mean: number; max: number } {
  for (let i = 0; i < 30; i++) world.step(); // warm-up
  let total = 0;
  let max = 0;
  for (let i = 0; i < STEPS; i++) {
    const t0 = performance.now();
    world.step();
    const dt = performance.now() - t0;
    total += dt;
    max = Math.max(max, dt);
  }
  return { mean: total / STEPS, max };
}

function report(name: string, r: { mean: number; max: number }): void {
  console.log(`[bench] ${name}: mean ${r.mean.toFixed(3)} ms/step, worst ${r.max.toFixed(3)} ms (budget ${STEP_BUDGET_MS} ms)`);
}

describe("physics step time", () => {
  it("falling cube stays within budget", () => {
    const { world } = buildFallingCubeSim(R);
    const r = measure(world);
    report("falling-cube", r);
    expect(r.mean).toBeLessThan(STEP_BUDGET_MS);
    world.free();
  });

  it("stress: 400 dynamic boxes stay within budget", () => {
    // Well beyond any planned exhibit; an early warning if the step loop gets slower.
    const world = createWorld(R);
    const floor = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
    world.createCollider(R.ColliderDesc.cuboid(20, 0.5, 20), floor);
    for (let i = 0; i < 400; i++) {
      const x = (i % 10) - 4.5;
      const z = (Math.floor(i / 10) % 10) - 4.5;
      const y = 1 + Math.floor(i / 100) * 1.2;
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(x * 1.1, y, z * 1.1));
      world.createCollider(R.ColliderDesc.cuboid(0.5, 0.5, 0.5), body);
    }
    const r = measure(world);
    report("stress-400", r);
    expect(r.mean).toBeLessThan(STEP_BUDGET_MS);
    world.free();
  });
});
