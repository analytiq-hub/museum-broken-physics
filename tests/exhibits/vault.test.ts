import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { NEED, VaultExhibit, type Spin } from "../../src/exhibits/vault/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: VaultExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved() && !ex.isFailed(); i++) ex.step();
};

/** Set spin, light the oven, wait `t` seconds, then put Planck's constant right (to `planck`, default the law). */
function play(spin: Spin, t: number, options: { scale?: number; planck?: number; budget?: number } = {}) {
  ex = new VaultExhibit(R, { budget: options.budget });
  if (spin !== "any") ex.setRule("spin", spin);
  if (options.scale !== undefined) ex.setRule("planck", options.scale);
  ex.setRule("oven", "lit");
  seconds(t);
  if (!ex.isFailed() && !ex.isSolved()) ex.setRule("planck", options.planck ?? 0);
  seconds(3);
}

/** Seconds (in 0.5 s steps up to 25 s) at which putting Planck's constant right opens the door. */
function window(spin: Spin, scale?: number, budget?: number): number {
  let good = 0;
  for (let t = 0.5; t <= 25; t += 0.5) {
    play(spin, t, scale === undefined ? { budget } : { scale, planck: 0, budget });
    if (ex.isSolved()) good += 0.5;
    ex.dispose();
  }
  return good;
}

describe("the silver vault", () => {
  it("cold, nothing happens", () => {
    ex = new VaultExhibit(R);
    seconds(10);
    expect(ex.silver).toEqual({ glass: 0, vault: 0, out: 0 });
    expect(ex.isFailed()).toBe(false);
  });

  it("solution: spin right, light the oven, let it tunnel in, then measure: the door opens", () => {
    play("two", 6);
    expect(ex.isSolved()).toBe(true);
    expect(ex.silver.vault).toBeGreaterThanOrEqual(NEED);
    const closedY = ex.door.translation().y;
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("too soon it is still on the glass; too late it has leaked out the back", () => {
    play("two", 1.5);
    expect(ex.isFailed()).toBe(true);
    expect(ex.silver.glass).toBeGreaterThan(ex.silver.vault);
    ex.dispose();
    play("two", 18);
    expect(ex.isFailed()).toBe(true);
  });

  it("Planck's constant put right before the silver can tunnel: it stays on the glass", () => {
    ex = new VaultExhibit(R);
    ex.setRule("spin", "two");
    ex.setRule("planck", 0);
    ex.setRule("oven", "lit");
    seconds(5);
    expect(ex.isFailed()).toBe(true);
    expect(ex.silver.vault).toBe(0);
  });

  it("left alone, the silver leaks away and the room fails", () => {
    ex = new VaultExhibit(R);
    ex.setRule("spin", "two");
    ex.setRule("oven", "lit");
    seconds(60);
    expect(ex.isFailed()).toBe(true);
  });

  it("with spin smeared or three-valued, no timing fills the vault", () => {
    for (const spin of ["any", "three"] as Spin[]) expect(window(spin)).toBe(0);
    ex = new VaultExhibit(R);
  });

  it("the window is several seconds; the decoy constant costs the change that would measure it, and given a spare, its window is shorter", () => {
    const broken = window("two");
    expect(window("two", 2.5)).toBe(0);
    const decoy = window("two", 2.5, 3);
    expect(broken).toBeGreaterThanOrEqual(5);
    expect(broken).toBeLessThanOrEqual(10);
    expect(decoy).toBeGreaterThan(1);
    expect(decoy).toBeLessThan(broken);
    ex = new VaultExhibit(R);
  });

  it("brute force: of every pair of changes before measuring, only spin two then the true constant works", () => {
    const wins: string[] = [];
    for (const spin of ["any", "two", "three"] as Spin[]) {
      for (const planck of [0, 1, 2.5]) {
        play(spin, 6, { planck });
        if (ex.isSolved()) wins.push(`${spin}/${planck}`);
        ex.dispose();
      }
    }
    expect(wins).toEqual(["two/0"]);
    ex = new VaultExhibit(R);
  });

  it("the instrument shows both laws, not the oven, and names neither", () => {
    ex = new VaultExhibit(R);
    const m = instrumentModel(ex, "The Silver Vault");
    expect(m.rules.map((r) => r.id)).toEqual(["spin", "planck"]);
    for (const r of m.rules.slice(0, 2)) expect(r.explanation).not.toMatch(/should/);
  });
});
