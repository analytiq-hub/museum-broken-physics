import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { SidewaysGravityExhibit } from "../../src/exhibits/sideways-gravity/sim";
import { PendulumExhibit } from "../../src/exhibits/pendulum/sim";
import { LeaningPendulumExhibit } from "../../src/exhibits/leaning-pendulum/sim";
import { OpticsExhibit } from "../../src/exhibits/optics/sim";
import { BouncingExhibit } from "../../src/exhibits/bouncing/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: SidewaysGravityExhibit;

beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

describe("instrument model", () => {
  it("shows what is happening, but never what the law should be, until it's discovered", () => {
    ex = new SidewaysGravityExhibit(R);
    const m = instrumentModel(ex, "Sideways Gallery");
    expect(m.rules).toHaveLength(1);
    expect(m.rules[0]).toMatchObject({
      id: "gravity",
      reading: "Right wall",
      known: false,
      law: "",
      broken: false,
      canChange: true,
      explanation: "Gravity pulls toward the right wall here.",
    });
    expect(m.rules[0].options.find((o) => o.current)?.label).toBe("Right wall");
    expect(m.rules[0].options.some((o) => o.nominal)).toBe(false);
    expect(m.rules[0].explanation).not.toMatch(/floor|should/i);
    expect(m).toMatchObject({ changesLeft: 4, budget: 4, locked: undefined });
  });

  it("setting the right value doesn't give it away either", () => {
    ex = new SidewaysGravityExhibit(R);
    ex.setRule("gravity", "down");
    const m = instrumentModel(ex, "Sideways Gallery");
    expect(m.rules[0]).toMatchObject({ known: false, broken: false, law: "" });
    expect(m.changesLeft).toBe(3);
  });

  it("once discovered, shows the law, whether the room breaks it, and where it was learned", () => {
    ex = new SidewaysGravityExhibit(R);
    const known = new Map([["gravity", "The Sideways Gallery"]]);
    const m = instrumentModel(ex, "Sideways Gallery", known);
    expect(m.rules[0]).toMatchObject({
      known: true,
      discoveredIn: "The Sideways Gallery",
      law: "Floor",
      broken: true,
      explanation: "Gravity should pull toward the floor. Here it pulls toward the right wall.",
    });
    expect(m.rules[0].options.find((o) => o.nominal)?.label).toBe("Floor");
    ex.setRule("gravity", "down");
    expect(instrumentModel(ex, "Sideways Gallery", known).rules[0].broken).toBe(false);
  });

  it("no room's instrument names a law the player hasn't discovered", () => {
    ex = new SidewaysGravityExhibit(R); // afterEach disposes it
    for (const make of [() => new PendulumExhibit(R), () => new LeaningPendulumExhibit(R), () => new OpticsExhibit(R), () => new BouncingExhibit(R)]) {
      const room = make();
      for (const rule of instrumentModel(room, room.id).rules) {
        const lawLabel = String(rule.options.length ? room.rule(rule.id).nominal : "");
        expect(rule.known).toBe(false);
        expect(rule.explanation, `${room.id}.${rule.id}`).not.toMatch(/should/i);
        expect(rule.explanation, `${room.id}.${rule.id}`).not.toContain(`(${lawLabel})`);
        expect(rule.explanation, `${room.id}.${rule.id}`).not.toContain(` ${lawLabel} `);
      }
      room.dispose();
    }
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
