// Replays a recorded attempt headlessly: applies each rule change at the step
// it was made, then runs to the recorded end step. Sim only.
import type RAPIER from "@dimforge/rapier3d-compat";
import type { ExhibitBase, ExhibitState } from "../src/exhibits/Exhibit";
import { SidewaysGravityExhibit } from "../src/exhibits/sideways-gravity/sim";
import type { Attempt } from "../src/debug/recorder";

/** Builds a fresh exhibit by id, as it starts in the game. */
export const EXHIBITS: Record<string, (R: typeof RAPIER) => ExhibitBase> = {
  "sideways-gravity": (R) => new SidewaysGravityExhibit(R),
};

export interface ReplayResult {
  state: ExhibitState;
  /** Changes the exhibit refused during replay (should be none). */
  rejected: number;
}

export function replayAttempt(ex: ExhibitBase, attempt: Attempt): ReplayResult {
  let rejected = 0;
  for (const change of attempt.changes) {
    while (ex.stepCount < change.step) ex.step();
    if (!ex.setRule(change.rule, change.value)) rejected++;
  }
  while (ex.stepCount < attempt.endStep) ex.step();
  return { state: ex.describe(), rejected };
}
