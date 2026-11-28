import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { PLANCK_LAW, TunnelExhibit } from "../../src/exhibits/tunnel/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: TunnelExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved() && !ex.isFailed(); i++) ex.step();
};

/** Drop the marble, wait `t` seconds, then measure it (put Planck's constant right). */
function measureAfter(t: number, scale?: number) {
  ex = new TunnelExhibit(R);
  if (scale !== undefined) ex.setRule("planck", scale);
  ex.setRule("lever", "pulled");
  seconds(t);
  if (!ex.isFailed()) ex.setRule("planck", PLANCK_LAW);
  seconds(1);
}

describe("quantum tunnel", () => {
  it("held in the claw, nothing leaks", () => {
    ex = new TunnelExhibit(R);
    seconds(20);
    expect(ex.probabilities.well).toBe(1);
  });

  it("once dropped, the marble's probability leaks into the cup and then the drain", () => {
    ex = new TunnelExhibit(R);
    ex.setRule("lever", "pulled");
    seconds(5);
    expect(ex.probabilities.cup).toBeGreaterThan(ex.probabilities.well);
    seconds(40);
    expect(ex.isFailed()).toBe(true);
  });

  it("solution: measure it while the cup holds the most: it lands in the cup and the door opens", () => {
    measureAfter(5);
    expect(ex.found).toBe("cup");
    expect(ex.isSolved()).toBe(true);
    const closedY = ex.door.translation().y;
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("too soon, it is found in the well (and stays); too late, it is lost down the drain", () => {
    measureAfter(1.5);
    expect(ex.found).toBe("well");
    expect(ex.isSolved()).toBe(false);
    seconds(20);
    expect(ex.probabilities.well).toBe(1);
    ex.dispose();
    measureAfter(14);
    expect(ex.isFailed()).toBe(true);
  });

  it("the window is several seconds with the broken constant, and shorter with the decoy", () => {
    const window = (scale: number) => {
      const good: number[] = [];
      for (let t = 0.5; t <= 20; t += 0.5) {
        measureAfter(t, scale);
        if (ex.isSolved()) good.push(t);
        ex.dispose();
      }
      return good.length * 0.5;
    };
    const broken = window(1);
    const decoy = window(2.5);
    expect(broken).toBeGreaterThanOrEqual(6);
    expect(decoy).toBeGreaterThan(1.5);
    expect(decoy).toBeLessThan(broken);
    ex = new TunnelExhibit(R);
  });

  it("the instrument shows Planck's constant, not the lever, and doesn't name the law", () => {
    ex = new TunnelExhibit(R);
    const m = instrumentModel(ex, "The Quantum Tunnel");
    expect(m.rules.map((r) => r.id)).toEqual(["planck"]);
    expect(m.rules[0].explanation).not.toMatch(/should|6\.6 × 10⁻³⁴/);
  });
});
