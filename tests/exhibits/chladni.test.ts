import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { ChladniExhibit, NOTES, SPEED_LAW, SPEED_MARKS, TARGET } from "../../src/exhibits/chladni/sim";
import { MODES, modeIndex } from "../../src/exhibits/chladni/plate";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: ChladniExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved() && !ex.isFailed(); i++) ex.step();
};
const dominant = () => {
  const w = ex.weights();
  return w.indexOf(Math.max(...w));
};

describe("chladni plates", () => {
  it("in true brass, the third key draws the lock's figure, and it opens the door", () => {
    ex = new ChladniExhibit(R);
    const closedY = ex.door.translation().y;
    ex.setRule("brass-speed", SPEED_LAW);
    ex.setRule("note", "2");
    expect(dominant()).toBe(TARGET);
    expect(ex.changesUsed).toBe(1);
    seconds(4);
    expect(ex.isSolved()).toBe(true);
    expect(ex.cracked).toBe(false);
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("at the broken speed the third key draws mode (3, 4) instead, crisply, and the lock stays shut", () => {
    ex = new ChladniExhibit(R);
    ex.setRule("note", "2");
    expect(dominant()).toBe(modeIndex(3, 4));
    expect(Math.max(...ex.weights())).toBeGreaterThan(0.9);
    seconds(6);
    expect(ex.isSolved()).toBe(false);
  });

  it("every figure is shifted by the same ratio: at the broken speed, keys land on the figures of 1/0.68 the frequency", () => {
    ex = new ChladniExhibit(R);
    ex.setRule("note", "3");
    expect(MODES[dominant()]).toMatchObject({ n: 1, m: 6 });
    ex.setRule("note", "4");
    expect(MODES[dominant()]).toMatchObject({ n: 1, m: 7 });
  });

  it("leaving the plate ringing at resonance cracks it, then breaks it; stopping at the crack saves it", () => {
    ex = new ChladniExhibit(R);
    ex.setRule("brass-speed", SPEED_LAW);
    ex.setRule("note", "3"); // a decoy figure, drawn clearly
    seconds(14);
    expect(ex.isFailed()).toBe(true);
    ex.dispose();
    ex = new ChladniExhibit(R);
    ex.setRule("note", "2");
    while (!ex.cracked) ex.step();
    ex.setRule("note", "none");
    seconds(20);
    expect(ex.isFailed()).toBe(false);
    expect(ex.strain).toBeLessThan(0.2);
  });

  it("brute force: of every speed and key held for 6 s, only true brass and the third key open the lock", () => {
    const solved: string[] = [];
    for (const { value } of SPEED_MARKS) {
      for (let k = 0; k < NOTES.length; k++) {
        ex = new ChladniExhibit(R);
        if (value !== ex.rule("brass-speed").current) ex.setRule("brass-speed", value);
        ex.setRule("note", `${k}`);
        seconds(6);
        if (ex.isSolved()) solved.push(`${value}:${k}`);
        ex.dispose();
      }
    }
    expect(solved).toEqual([`${SPEED_LAW}:2`]);
    ex = new ChladniExhibit(R);
  });

  it("the instrument shows the speed in brass, not the keys, and doesn't name the law", () => {
    ex = new ChladniExhibit(R);
    const m = instrumentModel(ex, "The Chladni Plates");
    expect(m.rules.map((r) => r.id)).toEqual(["brass-speed"]);
    expect(m.rules[0].explanation).not.toContain("3500");
  });
});
