import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { OpticsExhibit } from "../../src/exhibits/optics/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: OpticsExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const run = (steps = 60) => {
  for (let i = 0; i < steps; i++) ex.step();
};

describe("optics: the hidden door", () => {
  it("starts with the broken index; the bent beam reveals the door but misses the photocell", () => {
    ex = new OpticsExhibit(R);
    run();
    expect(ex.rule("index").current).toBe(0.7);
    expect(ex.revealed).toBe(true);
    expect(ex.lit).toBe(false);
    expect(ex.isSolved()).toBe(false);
  });

  it("the right index and mirror angles light the photocell and open the door", () => {
    ex = new OpticsExhibit(R);
    expect(ex.setRule("index", 1.5)).toBe(true);
    expect(ex.setRule("mirror-b", 120)).toBe(true);
    run(120);
    expect(ex.lit).toBe(true);
    expect(ex.isSolved()).toBe(true);
    expect(ex.door.translation().y).toBeLessThan(-0.5);
  });

  it("the right mirrors with the broken index miss", () => {
    ex = new OpticsExhibit(R);
    ex.setRule("mirror-b", 120);
    run();
    expect(ex.lit).toBe(false);
  });

  it("turning mirrors is free; changing the index spends the budget", () => {
    ex = new OpticsExhibit(R);
    for (const angle of [15, 30, 45, 60, 75]) expect(ex.setRule("mirror-b", angle)).toBe(true);
    expect(ex.changesUsed).toBe(0);
    ex.setRule("index", 1.33);
    ex.setRule("index", 2.4);
    expect(ex.changesLeft).toBe(0);
    expect(ex.setRule("index", 1.5)).toBe(false);
    expect(ex.setRule("mirror-a", 0)).toBe(true); // mirrors still turn
  });

  it("the instrument lists the index law but not the mirrors", () => {
    ex = new OpticsExhibit(R);
    const m = instrumentModel(ex, "The Hidden Door");
    expect(m.rules.map((r) => r.id)).toEqual(["index"]);
    expect(m.rules[0]).toMatchObject({ reading: "Backwards (0.7)", law: "Glass (1.5)", broken: true });
  });

  it("reset restores the index and mirrors and closes the door", () => {
    ex = new OpticsExhibit(R);
    ex.setRule("index", 1.5);
    ex.setRule("mirror-b", 120);
    run(200);
    ex.reset();
    expect(ex.describe()).toMatchObject({ solved: false, changesUsed: 0, rules: { index: 0.7, "mirror-a": 135, "mirror-b": 0 } });
    expect(ex.door.translation().y).toBeGreaterThan(1);
  });
});
