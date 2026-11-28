import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { ATOM_SLOT, CHARGE_MARKS, RutherfordExhibit, SOURCE_SLOTS } from "../../src/exhibits/rutherford/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: RutherfordExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved(); i++) ex.step();
};
const ALIGNED = String(ATOM_SLOT);
/** The largest turn (degrees) of any finished track, from straight west. */
const maxDeflection = () =>
  Math.max(
    0,
    ...ex.tracks.filter((t) => !t.particle.alive && !t.particle.absorbed).map((t) => (Math.abs(Math.atan2(t.particle.vz, -t.particle.vx)) * 180) / Math.PI),
  );

describe("rutherford's gold foil", () => {
  it("with the charge spread through the atom, every particle passes almost straight, even aimed dead-on", () => {
    ex = new RutherfordExhibit(R);
    ex.setRule("source", ALIGNED);
    seconds(8);
    expect(maxDeflection()).toBeLessThan(10);
    expect(ex.hits).toBe(0);
  });

  it("with a nucleus, particles passing near it are flung away: the tracks point the way", () => {
    ex = new RutherfordExhibit(R);
    ex.setRule("charge", "nucleus");
    ex.setRule("source", String(ATOM_SLOT - 1)); // one slot to the north of it
    seconds(8);
    expect(maxDeflection()).toBeGreaterThan(20);
    // Flung north (−z), away from the nucleus to the south.
    const last = ex.tracks.find((t) => !t.particle.alive)!;
    expect(last.particle.vz).toBeLessThan(0);
    expect(ex.hits).toBe(0);
  });

  it("solution: a nucleus, and the source aimed dead-on: particles bounce straight back and open the door", () => {
    ex = new RutherfordExhibit(R);
    const closedY = ex.door.translation().y;
    ex.setRule("charge", "nucleus");
    ex.setRule("source", ALIGNED);
    expect(ex.changesUsed).toBe(1);
    seconds(12);
    expect(ex.isSolved()).toBe(true);
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("a negative nucleus swallows the aimed particles and bends the rest toward it", () => {
    ex = new RutherfordExhibit(R);
    ex.setRule("charge", "negative");
    ex.setRule("source", ALIGNED);
    seconds(8);
    expect(ex.tracks.some((t) => t.particle.absorbed)).toBe(true);
    expect(ex.hits).toBe(0);
  });

  it("brute force: of every charge and source position, only a nucleus aimed dead-on opens the door", () => {
    const solved: string[] = [];
    for (const { value } of CHARGE_MARKS) for (let slot = 0; slot < SOURCE_SLOTS.length; slot++) {
      ex = new RutherfordExhibit(R);
      if (value !== "spread") ex.setRule("charge", value);
      ex.setRule("source", String(slot));
      seconds(10);
      if (ex.isSolved()) solved.push(`${value}:${slot}`);
      ex.dispose();
    }
    expect(solved).toEqual([`nucleus:${ALIGNED}`]);
    ex = new RutherfordExhibit(R);
  }, 60_000);

  it("the instrument shows the atom's charge, not the source, and doesn't name the law", () => {
    ex = new RutherfordExhibit(R);
    const m = instrumentModel(ex, "Rutherford's Gold Foil");
    expect(m.rules.map((r) => r.id)).toEqual(["charge"]);
    expect(m.rules[0].explanation).not.toMatch(/should/);
  });
});
