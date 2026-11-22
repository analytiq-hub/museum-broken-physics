// Records a play session as rule changes stamped with the fixed-step count.
// Because physics is deterministic and fixed-step, replaying the same changes
// at the same steps reproduces the session exactly (harness/replay.ts).
// Sim-side: plain data, no DOM.

export interface RecordedChange {
  step: number;
  rule: string;
  value: unknown;
}

export type AttemptOutcome = "solved" | "failed" | "reset" | "in-progress";

/** One try at the room: from the start (or a reset) to solved, failed or reset. */
export interface Attempt {
  changes: RecordedChange[];
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

  constructor(exhibit: string) {
    this.current = { changes: [], outcome: "in-progress", endStep: 0 };
    this.recording = { version: 1, exhibit, recordedAt: new Date().toISOString(), attempts: [this.current] };
  }

  change(step: number, rule: string, value: unknown): void {
    if (this.current.outcome === "in-progress") this.current.changes.push({ step, rule, value });
  }

  /** Marks the current attempt solved or failed (first call wins). */
  finish(outcome: "solved" | "failed", step: number, ball: [number, number, number]): void {
    if (this.current.outcome !== "in-progress") return;
    Object.assign(this.current, { outcome, endStep: step, ball });
  }

  /** Closes the current attempt (as "reset" if it was still going) and starts a new one. */
  reset(step: number, ball: [number, number, number]): void {
    if (this.current.outcome === "in-progress") Object.assign(this.current, { outcome: "reset", endStep: step, ball });
    this.current = { changes: [], outcome: "in-progress", endStep: 0 };
    this.recording.attempts.push(this.current);
  }

  /** The recording without a trailing empty attempt. */
  toJSON(): Recording {
    const attempts = this.recording.attempts.filter((a) => a.changes.length > 0 || a.outcome !== "in-progress");
    return { ...this.recording, attempts };
  }
}
