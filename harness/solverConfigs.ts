// Solver settings per exhibit, shared by the threshold tests and the reports.
import { DAMPING_MARKS } from "../src/exhibits/pendulum/sim";
import type { SolverOptions } from "./solver";

const S = 60; // steps per second

/** Damping marks, tried after a grid of start times, with waits of 3, 8 or 15 s between moves. */
export const PENDULUM_SOLVER: Omit<SolverOptions, "maxMoves"> = {
  ruleId: "damping",
  values: DAMPING_MARKS.map((m) => m.value),
  initialWaits: [0, 6, 12, 18, 22, 25, 28, 31].map((t) => t * S),
  waits: [
    { label: "3 s", steps: 3 * S },
    { label: "8 s", steps: 8 * S },
    { label: "15 s", steps: 15 * S },
  ],
  terminal: 60 * S,
};
