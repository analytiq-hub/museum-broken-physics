import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { BELLS, DAMPING_LAW, PendulumExhibit } from "../../src/exhibits/pendulum/sim";

let R: typeof RAPIER;
let ex: PendulumExhibit;

beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

/** Runs the room for `seconds`, applying each [time, damping] change when its time comes. */
function run(seconds: number, changes: [number, number][] = []): PendulumExhibit {
  ex = new PendulumExhibit(R);
  const pending = [...changes];
  while (ex.stepCount < seconds * 60 && !ex.isSolved() && !ex.isFailed()) {
    while (pending.length && pending[0][0] * 60 <= ex.stepCount) {
      expect(ex.setRule("damping", pending.shift()![1])).toBe(true);
    }
    ex.step();
  }
  return ex;
}

describe("pendulum: the broken law", () => {
  it("starts with negative damping and gravity as it should be (fixed here)", () => {
    ex = new PendulumExhibit(R);
    expect(ex.rule("damping").current).toBeLessThan(0);
    expect(ex.rule("gravity")).toMatchObject({ current: "down", editable: false });
  });

  it("left alone, the swing grows, rings both bells in order, then breaks the vase", () => {
    run(60);
    expect(ex.rung).toEqual(BELLS.map((b) => b.name));
    expect(ex.vaseBroken).toBe(true);
    expect(ex.isFailed()).toBe(true);
  });

  it("the bob never comes below head height", () => {
    ex = new PendulumExhibit(R);
    let lowest = Infinity;
    for (let i = 0; i < 60 * 30; i++) {
      ex.step();
      lowest = Math.min(lowest, ex.bob.translation().y);
    }
    expect(lowest - 0.35).toBeGreaterThan(1.9);
  });
});

describe("pendulum: solutions", () => {
  it("heavy drag right after the high bell solves the room", () => {
    run(70, [[25, 0.4]]);
    expect(ex.describe()).toMatchObject({ solved: true, failed: false });
  });

  it("restoring the law after the high bell also solves it (more slowly)", () => {
    run(90, [[25, DAMPING_LAW]]);
    expect(ex.isSolved()).toBe(true);
  });

  it("holding the swing (no damping), then drag, solves it with both changes", () => {
    run(90, [
      [25, 0],
      [40, 0.4],
    ]);
    expect(ex.isSolved()).toBe(true);
  });
});

describe("pendulum: non-solutions", () => {
  it("restoring the law too early calms it before the high bell: not solved", () => {
    run(90, [[10, DAMPING_LAW]]);
    expect(ex.rung).toEqual(["bell-low"]);
    expect(ex.isSolved()).toBe(false);
    expect(ex.isFailed()).toBe(false);
  });

  it("waiting too long breaks the vase", () => {
    run(90, [[33, 0.4]]);
    expect(ex.isFailed()).toBe(true);
  });

  it("a stronger push breaks the vase sooner", () => {
    run(40, [[1, -0.15]]);
    expect(ex.isFailed()).toBe(true);
  });
});

describe("pendulum: save/load and reset", () => {
  it("load() resumes mid-swing exactly where save() left off", () => {
    ex = new PendulumExhibit(R);
    for (let i = 0; i < 600; i++) ex.step();
    const saved = ex.save();
    for (let i = 0; i < 300; i++) ex.step();
    const first = { ...ex.describe(), rung: [...ex.rung] };
    ex.load(saved);
    for (let i = 0; i < 300; i++) ex.step();
    expect({ ...ex.describe(), rung: [...ex.rung] }).toEqual(first);
  });

  it("reset restores the start, the broken law and the budget", () => {
    run(60);
    ex.reset();
    expect(ex.describe()).toMatchObject({ failed: false, solved: false, changesUsed: 0, step: 0 });
    expect(ex.rung).toEqual([]);
    expect(ex.rule("damping").current).toBeLessThan(0);
  });
});
