// Fixed-timestep accumulator. Pure logic (no DOM, no three.js), so it is
// unit-testable; the browser drives it from requestAnimationFrame.

/** Longest frame we will try to catch up on. Longer gaps (tab hidden, breakpoint) are dropped. */
export const MAX_FRAME_DT = 0.25;

export class FixedStepper {
  readonly dt: number;
  private readonly step: () => void;
  private accumulator = 0;

  constructor(dt: number, step: () => void) {
    this.dt = dt;
    this.step = step;
  }

  /**
   * Advances simulated time by `frameDt` seconds, running zero or more fixed
   * steps. Returns the interpolation factor in [0, 1): how far the render
   * should sit between the previous and the current physics state.
   */
  advance(frameDt: number): number {
    this.accumulator += Math.min(Math.max(frameDt, 0), MAX_FRAME_DT);
    while (this.accumulator >= this.dt) {
      this.step();
      this.accumulator -= this.dt;
    }
    return this.accumulator / this.dt;
  }

  /** Drops any partial step, e.g. after a reset. */
  clear(): void {
    this.accumulator = 0;
  }
}
