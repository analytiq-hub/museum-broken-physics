// Replays a recorded attempt headlessly: applies each rule change at the step
// it was made, then runs to the recorded end step. Sim only.
import type RAPIER from "@dimforge/rapier3d-compat";
import { FIXED_DT } from "../src/engine/physics";
import { Player, type PlayerInput, type PlayerState } from "../src/engine/player";
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
  /** First-person attempts: the player's state at the end. */
  player?: PlayerState;
}

/**
 * Replays one attempt in the same order as the game loop: at each step, rule
 * changes made before it, then that step's player input, then the player moves
 * and the world steps.
 */
export function replayAttempt(R: typeof RAPIER, ex: ExhibitBase, attempt: Attempt): ReplayResult {
  let player: Player | undefined;
  if (attempt.player) {
    player = new Player(R, { x: 0, y: 0, z: 0 });
    player.setState(attempt.player.start);
    player.attach(ex.world);
  }
  const inputs = attempt.inputs ?? [];
  let input: PlayerInput = { forward: 0, right: 0, yaw: 0 };
  let rejected = 0;
  let c = 0;
  let i = 0;
  while (ex.stepCount < attempt.endStep) {
    const step = ex.stepCount;
    for (; c < attempt.changes.length && attempt.changes[c].step === step; c++) {
      const change = attempt.changes[c];
      if (!ex.setRule(change.rule, change.value)) rejected++;
    }
    for (; i < inputs.length && inputs[i].step === step; i++) input = inputs[i];
    // FIXED_DT, as the game passes it: world.timestep reads back Rapier's f32
    // copy (0.0166666675), and that tiny difference makes the player drift.
    player?.step(input, FIXED_DT);
    ex.step();
  }
  rejected += attempt.changes.length - c; // changes the replay never reached
  return { state: ex.describe(), rejected, player: player?.getState() };
}
