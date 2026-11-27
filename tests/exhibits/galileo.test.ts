import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { GalileoExhibit, PAN, PANS, type Fall } from "../../src/exhibits/galileo/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: GalileoExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved() && !ex.isFailed(); i++) ex.step();
};

describe("Galileo's ledge", () => {
  it("left alone, the balls wait on the ledge", () => {
    ex = new GalileoExhibit(R);
    seconds(5);
    expect(ex.brass.translation().x).toBeCloseTo(-3.8, 2);
    expect(ex.cork.translation().x).toBeCloseTo(-3.8, 2);
    expect(ex.isFailed()).toBe(false);
  });

  it("kicked under the broken law, each ball lands in its own pan, but the balance can't hang level", () => {
    ex = new GalileoExhibit(R);
    ex.setRule("kicker", "fired");
    seconds(4);
    expect(ex.inPan("brass")).toBe(true);
    expect(ex.inPan("cork")).toBe(true);
    expect(ex.weights()).toEqual({ brass: 1, cork: 0.5 });
    expect(ex.isSolved()).toBe(false);
  });

  it("solution: kick, then put the law right: the pans weigh the same and the door opens", () => {
    ex = new GalileoExhibit(R);
    ex.setRule("kicker", "fired");
    seconds(3);
    ex.setRule("fall", "same");
    seconds(3);
    expect(ex.isSolved()).toBe(true);
    const closedY = ex.door.translation().y;
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("the law put right first (or the decoy): the cork ball falls short of its pan, onto the floor", () => {
    for (const fall of ["same", "more"] as Fall[]) {
      ex = new GalileoExhibit(R);
      ex.setRule("fall", fall);
      ex.setRule("kicker", "fired");
      seconds(4);
      expect(ex.isFailed()).toBe(true);
      expect(ex.cork.translation().x).toBeGreaterThan(PANS.cork.x + PAN.half);
      ex.dispose();
    }
    ex = new GalileoExhibit(R);
  });

  it("restoring the law in mid-flight is too soon as well: the cork ball still misses", () => {
    ex = new GalileoExhibit(R);
    ex.setRule("kicker", "fired");
    seconds(0.3);
    ex.setRule("fall", "same");
    seconds(4);
    expect(ex.isFailed()).toBe(true);
  });

  it("robust: each ball comes down near the middle of its pan, not on a rim", () => {
    ex = new GalileoExhibit(R);
    ex.setRule("kicker", "fired");
    const landed: Record<string, number> = {};
    for (let i = 0; i < 240; i++) {
      ex.step();
      for (const [name, ball] of [["brass", ex.brass], ["cork", ex.cork]] as const) {
        if (landed[name] === undefined && ball.translation().y < PAN.floor + PAN.wall) landed[name] = ball.translation().x;
      }
    }
    expect(Math.abs(landed.brass - PANS.brass.x)).toBeLessThan(PAN.half - 0.1);
    expect(Math.abs(landed.cork - PANS.cork.x)).toBeLessThan(PAN.half - 0.1);
    expect(ex.inPan("brass") && ex.inPan("cork")).toBe(true);
  });

  it("restoreSolved leaves both balls in their pans and the door open", () => {
    ex = new GalileoExhibit(R);
    ex.restoreSolved();
    expect(ex.isSolved()).toBe(true);
    expect(ex.inPan("brass") && ex.inPan("cork")).toBe(true);
  });

  it("the instrument shows cork's fall, not the kicker, and doesn't name the law", () => {
    ex = new GalileoExhibit(R);
    const m = instrumentModel(ex, "Galileo's Ledge");
    expect(m.rules.map((r) => r.id)).toEqual(["fall", "gravity"]);
    expect(m.rules[0].explanation).not.toMatch(/should/);
  });
});
