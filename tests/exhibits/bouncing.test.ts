import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { BOUNCE_LAW, BouncingExhibit } from "../../src/exhibits/bouncing/sim";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: BouncingExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

/** Steps until solved or failed (or `seconds` pass); `each` runs after every step. */
function run(seconds: number, each?: () => void): void {
  for (let i = 0; i < seconds * 60 && !ex.isSolved() && !ex.isFailed(); i++) {
    ex.step();
    each?.();
  }
}

/** A player who restores the law `delay` seconds after seeing the ball land on the balcony. */
function reactToBalcony(delay: number): void {
  let landed = -1;
  let fixed = false;
  run(60, () => {
    if (landed < 0 && ex.onBalcony()) landed = ex.stepCount;
    if (!fixed && landed >= 0 && ex.stepCount - landed >= delay * 60) fixed = ex.setRule("bounce", BOUNCE_LAW);
  });
}

describe("bouncing hall", () => {
  it("waits in the claw until the lever is pulled", () => {
    ex = new BouncingExhibit(R);
    const y = ex.ball.translation().y;
    run(3);
    expect(ex.ball.translation().y).toBeCloseTo(y);
    expect(ex.launched).toBe(false);
  });

  it("drops even after waiting in the claw long enough to fall asleep", () => {
    ex = new BouncingExhibit(R);
    for (let i = 0; i < 10 * 60; i++) ex.step();
    expect(ex.ball.isSleeping()).toBe(true);
    ex.setRule("lever", "pulled");
    run(1);
    expect(ex.bounces).toBe(1); // it fell and bounced off the anvil
  });

  it("with the broken law each bounce is higher, until the deflector throws it onto the balcony", () => {
    ex = new BouncingExhibit(R);
    expect(ex.setRule("lever", "pulled")).toBe(true);
    expect(ex.changesUsed).toBe(0); // the lever is a control: free
    const apexes: number[] = [];
    let lastVy = 0;
    run(30, () => {
      const vy = ex.ball.linvel().y;
      if (!ex.deflected && lastVy > 0 && vy <= 0) apexes.push(ex.ball.translation().y);
      lastVy = vy;
    });
    expect(apexes.length).toBeGreaterThan(4);
    for (let i = 1; i < apexes.length; i++) expect(apexes[i]).toBeGreaterThan(apexes[i - 1]);
    expect(ex.deflected).toBe(true);
  });

  it("solution: restore the bounce once the ball is on the balcony; it settles and the door opens", () => {
    ex = new BouncingExhibit(R);
    const closedY = ex.door.translation().y;
    ex.setRule("lever", "pulled");
    reactToBalcony(1);
    expect(ex.isSolved()).toBe(true);
    expect(ex.changesUsed).toBe(1);
    for (let i = 0; i < 180; i++) ex.step();
    expect(ex.isSolved()).toBe(true);
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("never fixing it: the ball bounces off the balcony and smashes the skylight", () => {
    ex = new BouncingExhibit(R);
    ex.setRule("lever", "pulled");
    run(60);
    expect(ex.isFailed()).toBe(true);
    expect(ex.shattered).toBe(true);
  });

  it("fixing it too early: the ball dies on the anvil", () => {
    ex = new BouncingExhibit(R);
    ex.setRule("bounce", BOUNCE_LAW);
    ex.setRule("lever", "pulled");
    run(30);
    expect(ex.isFailed()).toBe(true);
    expect(ex.dead).toBe(true);
  });

  it("fixing it before the ball reaches the deflector also fails", () => {
    ex = new BouncingExhibit(R);
    ex.setRule("lever", "pulled");
    run(30, () => {
      if (!ex.deflected && ex.ball.translation().y > 3.6 && ex.ball.linvel().y > 0) ex.setRule("bounce", BOUNCE_LAW);
    });
    expect(ex.isSolved()).toBe(false);
  });

  it("perfectly elastic holds the ball on the balcony; restoring the law then settles it", () => {
    ex = new BouncingExhibit(R);
    ex.setRule("lever", "pulled");
    let step = 0;
    run(60, () => {
      if (ex.rule("bounce").current !== 1 && step === 0 && ex.onBalcony()) {
        ex.setRule("bounce", 1);
        step = ex.stepCount;
      }
      if (step > 0 && ex.stepCount - step === 300) ex.setRule("bounce", BOUNCE_LAW);
    });
    expect(ex.isSolved()).toBe(true);
    expect(ex.changesUsed).toBe(2);
  });

  it("robust: reacting within 3 s of the landing works for any drop height in the claw", () => {
    for (const dropHeight of [1.45, 1.52, 1.6, 1.68, 1.75]) {
      for (const delay of [0, 1.5, 3]) {
        ex = new BouncingExhibit(R, { dropHeight });
        ex.setRule("lever", "pulled");
        reactToBalcony(delay);
        expect(ex.isSolved(), `drop ${dropHeight} m, react after ${delay} s`).toBe(true);
        ex.dispose();
      }
    }
    ex = new BouncingExhibit(R);
  });

  it("button-mashing rarely works: one change at a random moment seldom solves it", () => {
    ex = new BouncingExhibit(R);
    ex.setRule("lever", "pulled");
    const start = ex.save();
    let tries = 0;
    let solved = 0;
    for (const value of [1, 0.6, 0.2]) {
      for (let t = 0; t <= 24; t += 0.5) {
        ex.load(start);
        for (let i = 0; i < t * 60 && !ex.isFailed(); i++) ex.step();
        if (ex.isFailed()) continue;
        tries++;
        ex.setRule("bounce", value);
        run(40);
        if (ex.isSolved()) solved++;
      }
    }
    expect(solved).toBeGreaterThan(0);
    expect(solved / tries).toBeLessThan(0.25);
  });

  it("the instrument shows bounciness (not the lever)", () => {
    ex = new BouncingExhibit(R);
    const model = instrumentModel(ex, "The Bouncing Hall");
    const ids = model.rules.map((r) => r.id);
    expect(ids).toContain("bounce");
    expect(ids).not.toContain("lever");
  });
});
