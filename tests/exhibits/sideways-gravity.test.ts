import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import type { GravityDirection } from "../../src/rules/Rule";
import { BALL_START, SidewaysGravityExhibit } from "../../src/exhibits/sideways-gravity/sim";

let R: typeof RAPIER;
let ex: SidewaysGravityExhibit;

beforeAll(async () => {
  R = await initPhysics();
});

afterEach(() => ex?.dispose());

/** Applies each gravity change and lets the room settle, then gives solve detection time. */
function play(...moves: GravityDirection[]): SidewaysGravityExhibit {
  ex = new SidewaysGravityExhibit(R);
  for (const move of moves) {
    expect(ex.setRule("gravity", move), `move "${move}" rejected`).toBe(true);
    ex.stepUntilSettled();
  }
  for (let i = 0; i < 60; i++) ex.step();
  return ex;
}

describe("sideways gravity: starts broken", () => {
  it("gravity points east and the ball stays pinned high on the east wall", () => {
    play();
    const p = ex.ball.translation();
    expect(ex.rule("gravity").current).toBe("east");
    expect(p.x).toBeCloseTo(BALL_START.x, 1);
    expect(p.y).toBeCloseTo(BALL_START.y, 1);
    expect(ex.isSolved()).toBe(false);
    expect(ex.isFailed()).toBe(false);
  });
});

describe("sideways gravity: intended solutions", () => {
  it.each([
    ["north", "west", "down"],
    ["west", "north", "down"],
  ] as GravityDirection[][])("%s → %s → %s solves the room", (...moves) => {
    play(...moves);
    expect(ex.describe()).toMatchObject({ solved: true, failed: false });
  });

  it("the door opens once solved", () => {
    play("north", "west", "down");
    for (let i = 0; i < 120; i++) ex.step();
    expect(ex.doorOpenness).toBe(1);
    expect(ex.door.translation().y).toBeLessThan(-1);
  });
});

describe("sideways gravity: non-solutions fail visibly", () => {
  it.each([
    ["down"], // "just restore down": the plan's key shortcut that must fail
    ["north", "down"], // above the gap at the ledge's east end
    ["west", "down"], // not above the ledge
    ["south", "west", "down"],
    ["north", "west", "south", "down"],
  ] as GravityDirection[][])("%s → … drops the ball to the floor", (...moves) => {
    play(...moves);
    const state = ex.describe();
    expect(state.solved).toBe(false);
    expect(state.failed).toBe(true);
  });

  it("no move rescues the ball once it is on the floor", () => {
    play("down");
    for (const move of ["west", "north"] as GravityDirection[]) {
      ex.setRule("gravity", move); // rejected: the room is already failed
      ex.stepUntilSettled();
    }
    expect(ex.isFailed()).toBe(true);
  });
});

describe("sideways gravity: budget and reset", () => {
  it("rejects changes beyond the budget", () => {
    ex = new SidewaysGravityExhibit(R, 2);
    expect(ex.setRule("gravity", "north")).toBe(true);
    ex.stepUntilSettled();
    expect(ex.setRule("gravity", "south")).toBe(true);
    ex.stepUntilSettled();
    expect(ex.setRule("gravity", "north")).toBe(false);
    expect(ex.changesLeft).toBe(0);
  });

  it("rejects no-op and unknown values without spending budget", () => {
    ex = new SidewaysGravityExhibit(R);
    expect(ex.setRule("gravity", "east")).toBe(false);
    expect(ex.setRule("gravity", "up")).toBe(false);
    expect(ex.changesUsed).toBe(0);
  });

  it("reset restores the broken start, refunds the budget, and the solution works again", () => {
    play("north", "west", "down");
    expect(ex.isSolved()).toBe(true);

    ex.reset();
    expect(ex.describe()).toMatchObject({ solved: false, failed: false, changesUsed: 0, step: 0 });
    expect(ex.rule("gravity").current).toBe("east");
    expect(ex.ball.translation().x).toBeCloseTo(BALL_START.x, 2);

    for (const move of ["north", "west", "down"] as GravityDirection[]) {
      ex.setRule("gravity", move);
      ex.stepUntilSettled();
    }
    for (let i = 0; i < 60; i++) ex.step();
    expect(ex.isSolved()).toBe(true);
  });
});
