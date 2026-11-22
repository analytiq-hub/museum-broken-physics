// Puzzle solver: enumerates every sequence of rule changes within the budget,
// at a few timings, and reports which sequences solve the room. Sim only.
import type { ExhibitBase, ExhibitSave } from "../src/exhibits/Exhibit";

/** A wait between moves: a fixed number of steps, or until the room settles. */
export interface Wait {
  label: string;
  steps: number | "settle";
}

export interface Move {
  value: unknown;
  /** Label of the wait that followed this move ("settled" for the last one). */
  wait: string;
  /** First move only: steps waited before making it. */
  at?: number;
}

export interface SolverOptions {
  /** The rule the solver changes. */
  ruleId: string;
  /** Values to try for it. */
  values: readonly unknown[];
  /** Maximum moves per sequence (usually the exhibit's budget). */
  maxMoves: number;
  /** Waits tried between moves. Default: 20 steps ("early") or until settled ("settled"). */
  waits?: Wait[];
  /** Steps to wait before the first move, each tried. Default: [0]. */
  initialWaits?: number[];
  /**
   * How the outcome after the last move is judged: "settle" (default) steps
   * until the room settles, then `finishSteps` more for solve detection; a
   * number runs up to that many steps, stopping as soon as it's solved or failed.
   */
  terminal?: "settle" | number;
  /** Cap on a "settle" wait. */
  settleMaxSteps?: number;
  /** Steps after the last move's settle, for solve detection to latch. */
  finishSteps?: number;
}

export interface SolverResult {
  /** Complete sequences evaluated. */
  sequences: number;
  solutions: Move[][];
  /** Sequences that ended with the room failed. */
  failures: number;
  /** Sequences that ended neither solved nor failed. */
  unresolved: number;
  /** Physics steps simulated in total. */
  steps: number;
}

const DEFAULT_WAITS: Wait[] = [
  { label: "early", steps: 20 },
  { label: "settled", steps: "settle" },
];

export function solve(ex: ExhibitBase, options: SolverOptions): SolverResult {
  const waits = options.waits ?? DEFAULT_WAITS;
  const settleMaxSteps = options.settleMaxSteps ?? 600;
  const finishSteps = options.finishSteps ?? 60;
  const terminal = options.terminal ?? "settle";
  const result: SolverResult = { sequences: 0, solutions: [], failures: 0, unresolved: 0, steps: 0 };

  const done = () => ex.isSolved() || ex.isFailed();
  const run = (n: number) => {
    for (let i = 0; i < n && !done(); i++) {
      ex.step();
      result.steps++;
    }
  };
  /** Settle, then give solve detection time to latch. */
  const settle = () => {
    const before = ex.stepCount;
    ex.stepUntilSettled(settleMaxSteps);
    result.steps += ex.stepCount - before;
    run(finishSteps);
  };

  const visit = (state: ExhibitSave, prefix: Move[], at: number | undefined): void => {
    for (const value of options.values) {
      ex.load(state);
      if (!ex.setRule(options.ruleId, value)) continue;
      const afterMove = ex.save();
      const first = prefix.length === 0 && at ? { at } : {};

      // This move as the last one: judge the outcome.
      if (terminal === "settle") settle();
      else run(terminal);
      const sequence = [...prefix, { value, wait: "settled", ...first }];
      result.sequences++;
      if (ex.isSolved()) result.solutions.push(sequence);
      else if (ex.isFailed()) result.failures++;
      else result.unresolved++;

      if (prefix.length + 1 >= options.maxMoves) continue;

      // Or wait, then make another move.
      for (const wait of waits) {
        ex.load(afterMove);
        if (wait.steps === "settle") settle();
        else run(wait.steps);
        if (!done()) visit(ex.save(), [...prefix, { value, wait: wait.label, ...first }], undefined);
      }
    }
  };

  const start = ex.save();
  for (const initial of options.initialWaits ?? [0]) {
    ex.load(start);
    run(initial);
    if (!done()) visit(ex.save(), [], initial);
  }
  ex.load(start);
  return result;
}

/** "north → west (early) → down", or "after 25.0 s: 0.4 → …" when the first move waited. */
export function formatSequence(moves: Move[]): string {
  const start = moves[0]?.at ? `after ${(moves[0].at / 60).toFixed(1)} s: ` : "";
  return (
    start +
    moves.map((m, i) => `${String(m.value)}${m.wait !== "settled" && i < moves.length - 1 ? ` (${m.wait})` : ""}`).join(" → ")
  );
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
