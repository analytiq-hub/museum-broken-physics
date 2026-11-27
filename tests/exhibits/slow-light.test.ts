import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { SHUTTER, SlowLightExhibit, type LightSpeed } from "../../src/exhibits/slow-light/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: SlowLightExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const steps = (n: number) => {
  for (let i = 0; i < n && !ex.isSolved() && !ex.isFailed(); i++) ex.step();
};
/** Steps until the clock reads `at`. */
const until = (at: number) => steps(at - ex.clock);
const fire = () => ex.setRule("lamp", ex.rule("lamp").current === "0" ? "1" : "0");
/** The n-th opening of the shutter (0-based), in steps. */
const opening = (n: number) => SHUTTER.first + n * SHUTTER.period;

describe("slow light", () => {
  it("a slow flash crawls: it lights cell A at once and cell B two seconds later", () => {
    ex = new SlowLightExhibit(R);
    // Fire so the flash reaches the shutter in the middle of its first opening.
    until(opening(0) + 20 - 120);
    fire();
    steps(30);
    expect(ex.pulses).toHaveLength(1);
    expect(ex.sinceLit().a).toBeLessThan(30);
    steps(200);
    expect(ex.reading).toEqual({ kind: "apart", seconds: expect.closeTo(1.75, 1) });
    expect(ex.isSolved()).toBe(false);
    expect(ex.scorches).toBe(0);
  });

  it("fired the moment the shutter opens, a slow flash arrives after it shuts and scorches it; twice jams it", () => {
    ex = new SlowLightExhibit(R);
    until(opening(0) + 10);
    fire();
    steps(150);
    expect(ex.reading.kind).toBe("scorched");
    expect(ex.isFailed()).toBe(false);
    until(opening(1) + 10);
    fire();
    steps(150);
    expect(ex.isFailed()).toBe(true);
  });

  it("solution: restore the speed of light and fire while the shutter is open: both cells together, the door opens", () => {
    ex = new SlowLightExhibit(R);
    ex.setRule("light", "true");
    until(opening(0) + 15);
    fire();
    steps(2);
    expect(ex.reading).toEqual({ kind: "together" });
    expect(ex.isSolved()).toBe(true);
    const closedY = ex.door.translation().y;
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("robust: with the law restored, any reaction inside the opening works; outside it, scorches", () => {
    for (let reaction = 0; reaction < SHUTTER.open - 1; reaction += 4) {
      ex = new SlowLightExhibit(R);
      ex.setRule("light", "true");
      until(opening(1) + reaction);
      fire();
      steps(2);
      expect(ex.isSolved()).toBe(true);
      ex.dispose();
    }
    ex = new SlowLightExhibit(R);
    ex.setRule("light", "true");
    until(opening(0) + SHUTTER.open + 10);
    fire();
    steps(2);
    expect(ex.reading.kind).toBe("scorched");
  });

  it("no slow speed ever opens the door, however the flash is timed", () => {
    for (const speed of ["slow", "slower"] as LightSpeed[]) {
      for (let at = 1; at < opening(1); at += 7) {
        ex = new SlowLightExhibit(R);
        ex.setRule("light", speed);
        until(at);
        fire();
        steps(400);
        expect(ex.isSolved()).toBe(false);
        ex.dispose();
      }
    }
    ex = new SlowLightExhibit(R);
  });

  it("the lamp has to recharge: a second click straight away does nothing", () => {
    ex = new SlowLightExhibit(R);
    fire();
    steps(5);
    fire();
    steps(5);
    expect(ex.pulses).toHaveLength(1);
    steps(100);
    fire();
    steps(2);
    expect(ex.pulses).toHaveLength(2);
  });

  it("save/load and reset bring back the clock, the flashes in flight and the scorches", () => {
    ex = new SlowLightExhibit(R);
    until(100);
    fire();
    steps(20);
    const saved = ex.save();
    const x = ex.pulses[0].x;
    steps(200);
    ex.load(saved);
    expect(ex.clock).toBe(120);
    expect(ex.pulses[0].x).toBeCloseTo(x);
    ex.reset();
    expect(ex.clock).toBe(0);
    expect(ex.pulses).toHaveLength(0);
  });

  it("the instrument shows the speed of light, not the lamp, and doesn't name the law", () => {
    ex = new SlowLightExhibit(R);
    const m = instrumentModel(ex, "Slow Light");
    expect(m.rules.map((r) => r.id)).toEqual(["light", "gravity"]);
    expect(m.rules[0].explanation).not.toMatch(/should|300 000/);
  });
});
