// Records a play session as rule changes stamped with the fixed-step count.
// Because physics is deterministic and fixed-step, replaying the same changes
// at the same steps reproduces the session exactly (harness/replay.ts).
// First-person attempts also record the player's start state and their input
// (move keys and heading) on every step where it changed.
// Sim-side: plain data, no DOM.
import type { PlayerInput, PlayerState } from "../engine/player";

export interface RecordedChange {
  step: number;
  rule: string;
  value: unknown;
}

export type AttemptOutcome = "solved" | "failed" | "reset" | "in-progress";

/** Player input from `step` on, until the next recorded input. */
export interface RecordedInput extends PlayerInput {
  step: number;
}

/** One try at the room: from the start (or a reset) to solved, failed or reset. */
export interface Attempt {
  changes: RecordedChange[];
  /** First person only. */
  player?: { start: PlayerState; end?: PlayerState };
  inputs?: RecordedInput[];
  /**
   * The player re-entering this gallery's world partway through the attempt
   * (after time in another gallery, where this world didn't step): their state
   * on arrival, applied before that step on replay.
   */
  syncs?: { step: number; state: PlayerState }[];
  outcome: AttemptOutcome;
  /** Step count when the outcome was reached. */
  endStep: number;
  /** Ball position at the end, for checking replays. */
  ball?: [number, number, number];
}

export interface Recording {
  version: 1;
  exhibit: string;
  recordedAt: string;
  attempts: Attempt[];
}

export class Recorder {
  readonly recording: Recording;
  private current: Attempt;
  private readonly getPlayer: (() => PlayerState) | undefined;
  private lastInput: PlayerInput | undefined;

  /** Pass `getPlayer` to record first-person attempts (player start/end and input). */
  constructor(exhibit: string, getPlayer?: () => PlayerState) {
    this.getPlayer = getPlayer;
    this.current = this.newAttempt();
    this.recording = { version: 1, exhibit, recordedAt: new Date().toISOString(), attempts: [this.current] };
  }

  /** Call once per fixed step, before the player moves, with that step's input. */
  input(step: number, input: PlayerInput): void {
    if (!this.current.inputs || this.current.outcome !== "in-progress") return;
    const last = this.lastInput;
    if (last && last.forward === input.forward && last.right === input.right && last.yaw === input.yaw) return;
    this.current.inputs.push({ step, forward: input.forward, right: input.right, yaw: input.yaw });
    this.lastInput = { ...input };
  }

  /** The player just (re)entered this gallery's world: record where they arrived. */
  playerArrived(step: number): void {
    if (!this.getPlayer || this.current.outcome !== "in-progress") return;
    (this.current.syncs ??= []).push({ step, state: this.getPlayer() });
    this.lastInput = undefined; // record the next input even if unchanged
  }

  change(step: number, rule: string, value: unknown): void {
    if (this.current.outcome === "in-progress") this.current.changes.push({ step, rule, value });
  }

  /** Marks the current attempt solved or failed (first call wins). */
  finish(outcome: "solved" | "failed", step: number, ball: [number, number, number]): void {
    if (this.current.outcome !== "in-progress") return;
    this.close(outcome, step, ball);
  }

  /** Closes the current attempt (as "reset" if it was still going) and starts a new one. */
  reset(step: number, ball: [number, number, number]): void {
    this.endAttempt(step, ball);
    this.beginAttempt();
  }

  /** Closes the current attempt, as "reset" if it was still going. */
  endAttempt(step: number, ball: [number, number, number]): void {
    if (this.current.outcome === "in-progress") this.close("reset", step, ball);
  }

  /**
   * The room was put straight into its solved state from saved progress. Nothing
   * until the next reset can be replayed from the room's start, so it isn't
   * recorded: the current attempt is dropped, and the stand-in isn't kept.
   */
  skipUntilReset(): void {
    const i = this.recording.attempts.indexOf(this.current);
    if (i >= 0) this.recording.attempts.splice(i, 1);
    this.current = this.newAttempt();
  }

  /** Starts a new attempt, capturing the player's state now. */
  beginAttempt(): void {
    this.current = this.newAttempt();
    this.recording.attempts.push(this.current);
  }

  private newAttempt(): Attempt {
    this.lastInput = undefined;
    const attempt: Attempt = { changes: [], outcome: "in-progress", endStep: 0 };
    if (this.getPlayer) {
      attempt.player = { start: this.getPlayer() };
      attempt.inputs = [];
    }
    return attempt;
  }

  private close(outcome: Exclude<AttemptOutcome, "in-progress">, step: number, ball: [number, number, number]): void {
    Object.assign(this.current, { outcome, endStep: step, ball });
    if (this.current.player && this.getPlayer) this.current.player.end = this.getPlayer();
  }

  /** The recording without a trailing empty attempt. */
  toJSON(): Recording {
    const attempts = this.recording.attempts.filter((a) => a.changes.length > 0 || a.outcome !== "in-progress");
    return { ...this.recording, attempts };
  }
}
