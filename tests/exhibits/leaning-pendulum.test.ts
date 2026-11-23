import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { LeaningPendulumExhibit, hangingAngle } from "../../src/exhibits/leaning-pendulum/sim";

let R: typeof RAPIER;
let ex: LeaningPendulumExhibit;

beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const S = 60;
const stepUntil = (done: () => boolean, maxSeconds = 60) => {
  const limit = ex.stepCount + maxSeconds * S;
  while (!done() && !ex.isFailed() && ex.stepCount < limit) ex.step();
};
const calm = () => stepUntil(() => ex.amplitude < 4);

describe("leaning pendulum: two broken laws", () => {
  it("starts with gravity toward the right wall and negative damping", () => {
    ex = new LeaningPendulumExhibit(R);
    expect(ex.rule("gravity")).toMatchObject({ current: "north", editable: true });
    expect(ex.rule("damping").current).toBeLessThan(0);
    expect(ex.hanging).toBeCloseTo(-90);
    expect(hangingAngle("north-down")).toBeCloseTo(-45);
  });

  it("left alone, it rings the bell, then swings wider until it tears loose", () => {
    ex = new LeaningPendulumExhibit(R);
    stepUntil(() => false, 70);
    expect(ex.rung).toBe(true);
    expect(ex.tornLoose).toBe(true);
    expect(ex.isFailed()).toBe(true);
  });
});

describe("leaning pendulum: the intended order", () => {
  it("bell, drag, calm, lean the floor right, calm, floor: solved", () => {
    ex = new LeaningPendulumExhibit(R);
    stepUntil(() => ex.rung);
    ex.setRule("damping", 0.4);
    calm();
    ex.setRule("gravity", "north-down");
    calm();
    ex.setRule("gravity", "down");
    stepUntil(() => ex.isSolved());
    expect(ex.describe()).toMatchObject({ solved: true, failed: false, changesUsed: 3 });
  });
});

describe("leaning pendulum: the trade-off", () => {
  it("putting gravity straight back to the floor tears it loose, even when calm", () => {
    ex = new LeaningPendulumExhibit(R);
    stepUntil(() => ex.rung);
    ex.setRule("damping", 0.4);
    calm();
    ex.setRule("gravity", "down");
    stepUntil(() => false, 2);
    expect(ex.tornLoose).toBe(true);
  });

  it("leaning gravity before the bell rings puts the bell out of reach", () => {
    ex = new LeaningPendulumExhibit(R);
    ex.setRule("gravity", "north-down");
    ex.setRule("damping", 0.4);
    stepUntil(() => false, 30);
    expect(ex.rung).toBe(false);
    expect(ex.isFailed()).toBe(false);
  });

  it("tilting gravity before calming it (still swinging after the bell) tears it loose", () => {
    ex = new LeaningPendulumExhibit(R);
    stepUntil(() => ex.rung);
    stepUntil(() => false, 8); // let it swing wider
    ex.setRule("gravity", "north-down");
    stepUntil(() => false, 10);
    expect(ex.tornLoose).toBe(true);
  });

  it("calm, but the laws not both put right, is not solved", () => {
    ex = new LeaningPendulumExhibit(R);
    stepUntil(() => ex.rung);
    ex.setRule("damping", 0.4);
    stepUntil(() => false, 30);
    expect(ex.amplitude).toBeLessThan(4);
    expect(ex.isSolved()).toBe(false);
  });
});

describe("leaning pendulum: save/load and reset", () => {
  it("load() resumes exactly, including after tearing loose", () => {
    ex = new LeaningPendulumExhibit(R);
    stepUntil(() => ex.rung);
    ex.setRule("damping", 0.4);
    calm();
    ex.setRule("gravity", "down");
    const saved = ex.save();
    for (let i = 0; i < 200; i++) ex.step();
    const first = ex.describe();
    ex.load(saved);
    for (let i = 0; i < 200; i++) ex.step();
    expect(ex.describe()).toEqual(first);
    expect(ex.tornLoose).toBe(true);
  });

  it("reset re-hangs a torn-loose pendulum and restores both broken laws", () => {
    ex = new LeaningPendulumExhibit(R);
    ex.setRule("gravity", "down");
    stepUntil(() => false, 2);
    expect(ex.tornLoose).toBe(true);
    ex.reset();
    expect(ex.describe()).toMatchObject({ failed: false, changesUsed: 0, step: 0 });
    expect(ex.rule("gravity").current).toBe("north");
    for (let i = 0; i < 120; i++) ex.step();
    expect(ex.isFailed()).toBe(false);
  });
});
