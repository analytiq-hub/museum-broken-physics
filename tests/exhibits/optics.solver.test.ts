// The optics room is a static puzzle (no timing), so its "solver" is a full
// enumeration: every index mark × every pair of mirror angles.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { INDEX_LAW, INDEX_MARKS, MIRROR_ANGLES, OpticsExhibit } from "../../src/exhibits/optics/sim";

let R: typeof RAPIER;
const solving: { index: number; a: number; b: number }[] = [];
let states = 0;

beforeAll(async () => {
  R = await initPhysics();
  const ex = new OpticsExhibit(R, { budget: 99 });
  for (const { value: index } of INDEX_MARKS) {
    ex.setRule("index", index);
    for (const a of MIRROR_ANGLES) {
      ex.setRule("mirror-a", a);
      for (const b of MIRROR_ANGLES) {
        ex.setRule("mirror-b", b);
        states++;
        if (ex.lit) solving.push({ index, a, b });
      }
    }
  }
  ex.dispose();
});

describe("optics: solver metrics", () => {
  it("solvability: some arrangement lights the photocell", () => {
    expect(solving.length).toBeGreaterThan(0);
  });

  it("the law matters: only the glass index (1.5) ever lights it", () => {
    expect(solving.every((s) => s.index === INDEX_LAW)).toBe(true);
  });

  it("brute-force resistance: under 1% of arrangements light it", () => {
    expect(solving.length / states).toBeLessThan(0.01);
  });

  it("the beam always passes through the prism in a solution (the index is what's being tested)", () => {
    const ex = new OpticsExhibit(R, { budget: 99 });
    for (const s of solving) {
      ex.setRule("index", s.index);
      ex.setRule("mirror-a", s.a);
      ex.setRule("mirror-b", s.b);
      expect(ex.beam().through).toContain("glass");
    }
    ex.dispose();
  });
});
