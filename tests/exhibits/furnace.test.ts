import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { FurnaceExhibit } from "../../src/exhibits/furnace/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: FurnaceExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number, each?: () => void) => {
  for (let i = 0; i < s * 60 && !ex.isSolved() && !ex.isFailed(); i++) {
    ex.step();
    each?.();
  }
};

/** A player who aims at the ice and restores the law `delay` s after the latch drops (the hiss). */
function reactToHiss(delay: number, aimAfter = 0) {
  ex = new FurnaceExhibit(R);
  seconds(aimAfter);
  ex.setRule("mirror", "ice");
  let hiss = -1;
  seconds(120, () => {
    if (hiss < 0 && ex.unlatched) hiss = ex.stepCount;
    if (hiss >= 0 && ex.stepCount - hiss >= delay * 60 && ex.lawBroken) ex.setRule("heat", "hot-to-cold");
  });
}

describe("backwards furnace", () => {
  it("under the law the beam warms the ice only to about −3 °C: just restoring the law fails", () => {
    ex = new FurnaceExhibit(R);
    ex.setRule("heat", "hot-to-cold");
    ex.setRule("mirror", "ice");
    seconds(120);
    expect(ex.melted).toBe(0);
    expect(ex.temperatures.ice).toBeGreaterThan(-4);
    expect(ex.temperatures.ice).toBeLessThan(-2);
    expect(ex.isSolved()).toBe(false);
  });

  it("the tell-tale: left alone, the stove runs away to a glow and frost creeps in; nothing else moves", () => {
    ex = new FurnaceExhibit(R);
    seconds(40);
    expect(ex.temperatures.stove).toBeGreaterThan(200);
    expect(ex.frost).toBeGreaterThan(0.5);
    expect(ex.temperatures.ice).toBeCloseTo(-8);
    expect(ex.temperatures.wax).toBeCloseTo(-8);
    expect(ex.isFailed()).toBe(false);
  });

  it("solution: aim at the ice, let it run away and melt, restore the law; the door opens", () => {
    reactToHiss(1);
    expect(ex.isSolved()).toBe(true);
    expect(ex.temperatures.ice).toBeLessThan(100);
    const closedY = ex.door.translation().y;
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("left broken after the melt, the water boils and the frame bursts", () => {
    ex = new FurnaceExhibit(R);
    ex.setRule("mirror", "ice");
    seconds(120);
    expect(ex.isFailed()).toBe(true);
    expect(ex.boiled).toBe(true);
  });

  it("aiming at the wax melts the seal (fail); aiming at the stove just makes a glow", () => {
    ex = new FurnaceExhibit(R);
    ex.setRule("mirror", "wax");
    seconds(60);
    expect(ex.waxMelted).toBe(true);
    ex.dispose();
    ex = new FurnaceExhibit(R);
    ex.setRule("mirror", "stove");
    seconds(60);
    expect(ex.isFailed()).toBe(false);
    expect(ex.melted).toBe(0);
  });

  it("robust: reacting to the hiss within a few seconds works, whenever the player started", () => {
    const results: string[] = [];
    for (const aimAfter of [0, 10, 25]) for (const delay of [0, 2, 4]) {
      reactToHiss(delay, aimAfter);
      results.push(`${aimAfter}/${delay}:${ex.isSolved() ? "S" : "x"}`);
      ex.dispose();
    }
    expect(results.filter((r) => r.endsWith("x"))).toEqual([]);
    ex = new FurnaceExhibit(R);
  });

  it("restoring the law before the melt finishes leaves the ice frozen in the latch", () => {
    ex = new FurnaceExhibit(R);
    ex.setRule("mirror", "ice");
    seconds(60, () => {
      if (ex.melted > 0.3 && ex.lawBroken) ex.setRule("heat", "hot-to-cold");
    });
    expect(ex.isSolved()).toBe(false);
    expect(ex.melted).toBeLessThan(1);
  });

  it("the instrument shows heat flow, not the mirror, and doesn't name the law", () => {
    ex = new FurnaceExhibit(R);
    const m = instrumentModel(ex, "The Backwards Furnace");
    expect(m.rules.map((r) => r.id)).toEqual(["heat", "gravity"]);
    expect(m.rules[0].explanation).not.toMatch(/should/);
  });
});
