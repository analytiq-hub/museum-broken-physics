// Solver thresholds for Gallery III. Moves on two laws make this the most
// expensive search, so it is limited to the intended solution's length (3).
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { LeaningPendulumExhibit, START_OFFSET } from "../../src/exhibits/leaning-pendulum/sim";
import { formatSequence, seededRandom, solve, type Move, type SolverResult } from "../../harness/solver";
import { LEANING_SOLVER, LEANING_SOLVER_MAX_MOVES } from "../../harness/solverConfigs";

const S = 60;
let R: typeof RAPIER;
let result: SolverResult;

beforeAll(async () => {
  R = await initPhysics();
  const ex = new LeaningPendulumExhibit(R);
  result = solve(ex, { ...LEANING_SOLVER, maxMoves: LEANING_SOLVER_MAX_MOVES });
  ex.dispose();
}, 180_000);

const gravityMoves = (s: Move[]) => s.filter((m) => m.rule === "gravity").map((m) => m.value);

describe("leaning pendulum: solver metrics", () => {
  it("solvability: there are solutions", () => {
    expect(result.solutions.length).toBeGreaterThan(0);
  });

  it("shortcuts: nothing shorter than three moves solves it", () => {
    expect(Math.min(...result.solutions.map((s) => s.length))).toBe(3);
  });

  it("the trade-off holds: every solution brings gravity home through the leaning floor", () => {
    const offKind = result.solutions
      .filter((s) => {
        const g = gravityMoves(s);
        return !(g.at(-1) === "down" && g.includes("north-down") && g.indexOf("north-down") < g.lastIndexOf("down"));
      })
      .map(formatSequence);
    expect(offKind).toEqual([]);
  });

  it("every solution puts a drag on the swing", () => {
    const offKind = result.solutions.filter((s) => !s.some((m) => m.rule === "damping" && Number(m.value) > 0)).map(formatSequence);
    expect(offKind).toEqual([]);
  });

  it("brute-force resistance: under 5% of sequences solve it", () => {
    expect(result.solutions.length / result.sequences).toBeLessThan(0.05);
  });

  it("robustness: a player reacting to the bell and to the swing calming succeeds ≥95% of the time", () => {
    const random = seededRandom(7);
    const react = () => Math.round((0.5 + random() * 2.5) * S);
    const trials = 40;
    let solved = 0;
    for (let t = 0; t < trials; t++) {
      const ex = new LeaningPendulumExhibit(R, { startOffset: START_OFFSET + (random() - 0.5) * 4 });
      const run = (n: number) => {
        for (let i = 0; i < n && !ex.isFailed(); i++) ex.step();
      };
      const until = (done: () => boolean) => {
        const limit = ex.stepCount + 60 * S;
        while (!done() && !ex.isFailed() && ex.stepCount < limit) ex.step();
      };
      until(() => ex.rung);
      run(react());
      ex.setRule("damping", 0.4);
      until(() => ex.amplitude < 5);
      run(react());
      ex.setRule("gravity", "north-down");
      until(() => ex.amplitude < 5);
      run(react());
      ex.setRule("gravity", "down");
      until(() => ex.isSolved());
      if (ex.isSolved()) solved++;
      ex.dispose();
    }
    expect(solved / trials).toBeGreaterThanOrEqual(0.95);
  });
});
