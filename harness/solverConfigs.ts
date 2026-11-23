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

/**
 * Gallery III: moves on both laws (other gravity directions, damping marks),
 * up to three of them (the intended solution's length; the room allows four),
 * after a start delay of 0 or 11 s (just after the bell), waits of 5 or 12 s.
 */
export const LEANING_SOLVER: Omit<SolverOptions, "maxMoves"> = {
  moves: [
    ...(["north-down", "down", "south-down", "south"] as const).map((value) => ({ rule: "gravity", value })),
    ...[-0.15, 0, 0.15, 0.4].map((value) => ({ rule: "damping", value })),
  ],
  initialWaits: [0, 11 * S],
  waits: [
    { label: "5 s", steps: 5 * S },
    { label: "12 s", steps: 12 * S },
  ],
  terminal: 30 * S,
};
export const LEANING_SOLVER_MAX_MOVES = 3;
