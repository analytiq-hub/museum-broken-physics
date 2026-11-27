import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { BEAM_Y, BENCH_TOP, CELL_HALF, SPIN_MARKS, SPLIT, SternGerlachExhibit } from "../../src/exhibits/stern-gerlach/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: SternGerlachExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved() && !ex.isFailed(); i++) ex.step();
};

describe("stern–gerlach", () => {
  it("with the oven cold nothing happens", () => {
    ex = new SternGerlachExhibit(R);
    seconds(20);
    expect(ex.isSolved() || ex.isFailed()).toBe(false);
  });

  it("with spin taking any value along the field, the beam smears: the detectors starve and the middle cell slowly cracks", () => {
    ex = new SternGerlachExhibit(R);
    ex.setRule("oven", "on");
    const c = ex.cells();
    expect(c.up).toBeLessThan(0.3);
    expect(c.middle).toBeGreaterThan(0);
    seconds(20);
    expect(ex.isFailed()).toBe(false); // slow: time to react
    seconds(25);
    expect(ex.isFailed()).toBe(true);
  });

  it("solution: two values, up or down: two spots on the detectors, the middle dark; the door opens", () => {
    ex = new SternGerlachExhibit(R);
    const closedY = ex.door.translation().y;
    ex.setRule("spin", "two");
    ex.setRule("oven", "on");
    expect(ex.changesUsed).toBe(1);
    seconds(4);
    expect(ex.isSolved()).toBe(true);
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("noticing the smear and fixing spin a few seconds in still works", () => {
    ex = new SternGerlachExhibit(R);
    ex.setRule("oven", "on");
    seconds(6);
    ex.setRule("spin", "two");
    seconds(6);
    expect(ex.isSolved()).toBe(true);
  });

  it("three values put a spot on the middle cell: it cracks, faster than the smear, and the door stays shut", () => {
    ex = new SternGerlachExhibit(R);
    ex.setRule("spin", "three");
    ex.setRule("oven", "on");
    seconds(6);
    expect(ex.isFailed()).toBe(false); // time to see the third spot and react
    seconds(8);
    expect(ex.isFailed()).toBe(true);
    expect(ex.isSolved()).toBe(false);
  });

  it("trying three values and switching to two a few seconds in still works", () => {
    ex = new SternGerlachExhibit(R);
    ex.setRule("spin", "three");
    ex.setRule("oven", "on");
    seconds(5);
    ex.setRule("spin", "two");
    seconds(6);
    expect(ex.isSolved()).toBe(true);
  });

  it("the lower detector sits above the bench, where the beam can reach it", () => {
    ex = new SternGerlachExhibit(R);
    expect(BEAM_Y - SPLIT - CELL_HALF).toBeGreaterThan(BENCH_TOP + 0.05);
  });

  it("brute force: only two values open the door", () => {
    const solved = SPIN_MARKS.filter(({ value }) => {
      ex = new SternGerlachExhibit(R);
      if (value !== "any") ex.setRule("spin", value);
      ex.setRule("oven", "on");
      seconds(10);
      const ok = ex.isSolved();
      ex.dispose();
      return ok;
    }).map((m) => m.value);
    expect(solved).toEqual(["two"]);
    ex = new SternGerlachExhibit(R);
  });

  it("the instrument shows spin, not the oven, and doesn't name the law", () => {
    ex = new SternGerlachExhibit(R);
    const m = instrumentModel(ex, "Stern–Gerlach");
    expect(m.rules.map((r) => r.id)).toEqual(["spin", "gravity"]);
    expect(m.rules[0].explanation).not.toMatch(/should/);
  });
});
