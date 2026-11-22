// Puzzle solver: enumerates every sequence of rule changes within the budget,
// at a few timings, and reports which sequences solve the room. Sim only.
import type { ExhibitBase, ExhibitSave } from "../src/exhibits/Exhibit";

/**
 * How long to wait after a move before the next one:
 * "short" = while things are still moving, "settle" = once the room is at rest.
 */
export type Wait = "short" | "settle";

export interface Move {
  value: unknown;
  wait: Wait;
}

export interface SolverOptions {
  /** The rule the solver changes. */
  ruleId: string;
  /** Values to try for it. */
  values: readonly unknown[];
  /** Maximum moves per sequence (usually the exhibit's budget). */
  maxMoves: number;
  /** Steps for a "short" wait. */
  shortSteps?: number;
  /** Cap on a "settle" wait. */
  settleMaxSteps?: number;
  /** Steps after the last move's settle, for solve detection to latch. */
  finishSteps?: number;
}

export interface SolverResult {
  /** Complete sequences evaluated (each ends with a "settle" wait). */
  sequences: number;
  solutions: Move[][];
  /** Sequences that ended with the room failed. */
  failures: number;
  /** Sequences that ended neither solved nor failed. */
  unresolved: number;
  /** Physics steps simulated in total. */
  steps: number;
}

export function solve(ex: ExhibitBase, options: SolverOptions): SolverResult {
  const shortSteps = options.shortSteps ?? 20;
  const settleMaxSteps = options.settleMaxSteps ?? 600;
  const finishSteps = options.finishSteps ?? 60;
  const result: SolverResult = { sequences: 0, solutions: [], failures: 0, unresolved: 0, steps: 0 };

  const run = (n: number) => {
    for (let i = 0; i < n && !ex.isSolved() && !ex.isFailed(); i++) {
      ex.step();
      result.steps++;
    }
  };
  const settle = () => {
    const before = ex.stepCount;
    ex.stepUntilSettled(settleMaxSteps);
    result.steps += ex.stepCount - before;
  };
  const done = () => ex.isSolved() || ex.isFailed();

  const visit = (state: ExhibitSave, prefix: Move[]): void => {
    for (const value of options.values) {
      ex.load(state);
      if (!ex.setRule(options.ruleId, value)) continue;
      const afterMove = ex.save();

      // This move as the last one: settle, give solve detection time, record the outcome.
      // A "settle" continuation starts from the same point, so a room that is about
      // to latch "solved" isn't credited with extra moves.
      settle();
      run(finishSteps);
      const settled = ex.save();
      const sequence = [...prefix, { value, wait: "settle" as const }];
      result.sequences++;
      if (ex.isSolved()) result.solutions.push(sequence);
      else if (ex.isFailed()) result.failures++;
      else result.unresolved++;

      if (prefix.length + 1 >= options.maxMoves) continue;

      // Continue after the room settles...
      ex.load(settled);
      if (!done()) visit(settled, sequence);

      // ...or while it is still moving.
      ex.load(afterMove);
      run(shortSteps);
      if (!done()) visit(ex.save(), [...prefix, { value, wait: "short" }]);
    }
  };

  const start = ex.save();
  visit(start, []);
  ex.load(start);
  return result;
}

/** "north → west (early) → down" */
export function formatSequence(moves: Move[]): string {
  return moves.map((m, i) => `${String(m.value)}${m.wait === "short" && i < moves.length - 1 ? " (early)" : ""}`).join(" → ");
}

/** Small deterministic PRNG (mulberry32), so jittered runs are repeatable. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
