// Solver thresholds for the pendulum room (docs/plan.md, "Solver metrics").
// Damping is a "range" rule: the solver samples its named marks, at a grid of
// start times and waits, which is what makes this room timing-sensitive.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { PendulumExhibit, START_ANGLE } from "../../src/exhibits/pendulum/sim";
import { formatSequence, seededRandom, solve, type SolverResult } from "../../harness/solver";
import { PENDULUM_SOLVER } from "../../harness/solverConfigs";

const S = 60; // steps per second

/** The intended solution: heavy drag soon after the high bell rings. */
const INTENDED_DAMPING = 0.4;

let R: typeof RAPIER;
let result: SolverResult;

beforeAll(async () => {
  R = await initPhysics();
  const ex = new PendulumExhibit(R);
  result = solve(ex, { ...PENDULUM_SOLVER, maxMoves: ex.budget });
  ex.dispose();
}, 120_000);

describe("pendulum: solver metrics", () => {
  it("solvability: heavy drag after the high bell is among the solutions", () => {
    expect(result.solutions.some((s) => s.length === 1 && s[0].value === 0.4 && (s[0].at ?? 0) >= 22 * S)).toBe(true);
  });

  it("shortcuts: every solution puts a drag on the swing at some point", () => {
    // (A move after that can be a no-op: the room may already be about to count as at rest.)
    const offKind = result.solutions.filter((s) => !s.some((m) => Number(m.value) > 0)).map(formatSequence);
    expect(offKind).toEqual([]);
  });

  it("shortcuts: no single drag before the high bell solves it", () => {
    // One early drag calms the swing with a bell still silent; it must be used first.
    const early = result.solutions.filter((s) => s.length === 1 && (s[0].at ?? 0) < 22 * S).map(formatSequence);
    expect(early).toEqual([]);
  });

  it("brute-force resistance: under 15% of sequences solve the room", () => {
    expect(result.solutions.length / result.sequences).toBeLessThan(0.15);
  });

  it("robustness: the intended solution works in ≥95% of jittered runs", () => {
    const random = seededRandom(99);
    const trials = 40;
    let solved = 0;
    for (let t = 0; t < trials; t++) {
      // A player hears the high bell and reacts within 0.5–3 s.
      const ex = new PendulumExhibit(R, { startAngle: START_ANGLE + (random() - 0.5) * 4 });
      while (!ex.rung.includes("bell-high") && !ex.isFailed() && ex.stepCount < 60 * S) ex.step();
      const reaction = Math.round((0.5 + random() * 2.5) * S);
      for (let i = 0; i < reaction && !ex.isFailed(); i++) ex.step();
      ex.setRule("damping", INTENDED_DAMPING);
      const until = ex.stepCount + 60 * S;
      while (ex.stepCount < until && !ex.isSolved() && !ex.isFailed()) ex.step();
      if (ex.isSolved()) solved++;
      ex.dispose();
    }
    expect(solved / trials).toBeGreaterThanOrEqual(0.95);
  });
});
