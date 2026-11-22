import { describe, expect, it } from "vitest";
import { FixedStepper, MAX_FRAME_DT } from "../../src/engine/loop";

const DT = 1 / 60;

function counter() {
  let n = 0;
  return { step: () => n++, get count() { return n; } };
}

describe("FixedStepper", () => {
  it("runs no step for a frame shorter than dt, and reports the fraction", () => {
    const c = counter();
    const s = new FixedStepper(DT, c.step);
    const alpha = s.advance(DT / 2);
    expect(c.count).toBe(0);
    expect(alpha).toBeCloseTo(0.5);
  });

  it("carries leftover time between frames", () => {
    const c = counter();
    const s = new FixedStepper(DT, c.step);
    s.advance(DT * 0.6);
    s.advance(DT * 0.6);
    expect(c.count).toBe(1);
  });

  it("runs several steps for a long frame", () => {
    const c = counter();
    const s = new FixedStepper(DT, c.step);
    s.advance(DT * 3.5);
    expect(c.count).toBe(3);
  });

  it("step count depends on total time, not frame rate", () => {
    const at30 = counter();
    const at144 = counter();
    const s30 = new FixedStepper(DT, at30.step);
    const s144 = new FixedStepper(DT, at144.step);
    for (let i = 0; i < 30; i++) s30.advance(1 / 30);
    for (let i = 0; i < 144; i++) s144.advance(1 / 144);
    expect(Math.abs(at30.count - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(at144.count - 60)).toBeLessThanOrEqual(1);
  });

  it("caps a huge frame (e.g. tab was hidden) instead of spiralling", () => {
    const c = counter();
    const s = new FixedStepper(DT, c.step);
    s.advance(10);
    expect(c.count).toBe(Math.floor(MAX_FRAME_DT / DT));
  });

  it("clear() drops the partial step", () => {
    const c = counter();
    const s = new FixedStepper(DT, c.step);
    s.advance(DT * 0.9);
    s.clear();
    s.advance(DT * 0.2);
    expect(c.count).toBe(0);
  });
});
