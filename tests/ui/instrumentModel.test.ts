import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { SidewaysGravityExhibit } from "../../src/exhibits/sideways-gravity/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: SidewaysGravityExhibit;

beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

describe("instrument model", () => {
  it("tells a newcomer what is wrong with the room", () => {
    ex = new SidewaysGravityExhibit(R);
    const m = instrumentModel(ex, "Sideways Gallery");
    expect(m.rules).toHaveLength(1);
    expect(m.rules[0]).toMatchObject({
      id: "gravity",
      reading: "Right wall",
      law: "Floor",
      broken: true,
      canChange: true,
      explanation: "Gravity should pull toward the floor. Here it pulls toward the right wall.",
    });
    expect(m.rules[0].options.find((o) => o.current)?.label).toBe("Right wall");
    expect(m.rules[0].options.find((o) => o.nominal)?.label).toBe("Floor");
    expect(m).toMatchObject({ changesLeft: 4, budget: 4, locked: undefined });
  });

  it("shows a restored law as nominal and counts the change", () => {
    ex = new SidewaysGravityExhibit(R);
    ex.setRule("gravity", "down");
    const m = instrumentModel(ex, "Sideways Gallery");
    expect(m.rules[0].broken).toBe(false);
    expect(m.changesLeft).toBe(3);
  });

  it("locks changes when the budget is spent", () => {
    ex = new SidewaysGravityExhibit(R, { budget: 1 });
    ex.setRule("gravity", "north");
    const m = instrumentModel(ex, "Sideways Gallery");
    expect(m.locked).toMatch(/No changes left/);
    expect(m.rules[0].canChange).toBe(false);
  });

  it("locks changes once solved", () => {
    ex = new SidewaysGravityExhibit(R);
    for (const move of ["north", "west", "down"]) {
      ex.setRule("gravity", move);
      ex.stepUntilSettled();
    }
    for (let i = 0; i < 60; i++) ex.step();
    expect(instrumentModel(ex, "Sideways Gallery").locked).toMatch(/solved/);
  });
});
