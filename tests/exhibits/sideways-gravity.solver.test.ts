// Solver thresholds for the sideways-gravity room (docs/plan.md, "Solver metrics").
// If a layout change breaks one of these, the room got easier, harder or more finicky.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import type { GravityDirection } from "../../src/rules/Rule";
import { GRAVITY_OPTIONS, SidewaysGravityExhibit } from "../../src/exhibits/sideways-gravity/sim";
import { formatSequence, seededRandom, solve, type SolverResult } from "../../harness/solver";

const INTENDED: GravityDirection[] = ["north", "west", "down"];

let R: typeof RAPIER;
let result: SolverResult;

beforeAll(async () => {
  R = await initPhysics();
  const ex = new SidewaysGravityExhibit(R);
  result = solve(ex, { ruleId: "gravity", values: GRAVITY_OPTIONS, maxMoves: ex.budget });
  ex.dispose();
}, 60_000);

describe("sideways gravity: solver metrics", () => {
  it("solvability: the intended solution is among the solutions", () => {
    const found = result.solutions.map(formatSequence);
    expect(found).toContain(INTENDED.join(" → "));
  });

  it("shortcuts: no solution shorter than the intended one", () => {
    const shortest = Math.min(...result.solutions.map((s) => s.length));
    expect(shortest).toBe(INTENDED.length);
  });

  it("shortcuts: every solution is the same in kind (goes north and west while high)", () => {
    const offKind = result.solutions
      .filter((s) => !(s.some((m) => m.value === "north") && s.some((m) => m.value === "west")))
      .map(formatSequence);
    expect(offKind).toEqual([]);
  });

  it("brute-force resistance: under 10% of sequences solve the room", () => {
    expect(result.solutions.length / result.sequences).toBeLessThan(0.1);
  });

  it("robustness: the intended solution works in ≥95% of jittered runs", () => {
    const random = seededRandom(1234);
    const trials = 40;
    let solved = 0;
    for (let t = 0; t < trials; t++) {
      const ex = new SidewaysGravityExhibit(R, {
        ballOffset: { y: (random() - 0.5) * 0.8, z: (random() - 0.5) * 3 },
      });
      for (const move of INTENDED) {
        ex.stepUntilSettled();
        const hesitate = Math.floor(random() * 30); // a human doesn't press the instant it settles
        for (let i = 0; i < hesitate; i++) ex.step();
        ex.setRule("gravity", move);
      }
      ex.stepUntilSettled();
      for (let i = 0; i < 60; i++) ex.step();
      if (ex.isSolved()) solved++;
      ex.dispose();
    }
    expect(solved / trials).toBeGreaterThanOrEqual(0.95);
  });
});
