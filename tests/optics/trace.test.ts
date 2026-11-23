import { describe, expect, it } from "vitest";
import { mirrorSegment, prism, traceBeam, type OpticsScene, type Segment } from "../../src/exhibits/optics/trace";

const box = (half: number): Segment[] => [
  { id: "n", kind: "wall", a: { x: -half, z: -half }, b: { x: half, z: -half } },
  { id: "s", kind: "wall", a: { x: -half, z: half }, b: { x: half, z: half } },
  { id: "w", kind: "wall", a: { x: -half, z: -half }, b: { x: -half, z: half } },
  { id: "e", kind: "wall", a: { x: half, z: -half }, b: { x: half, z: half } },
];

/** Where a beam through a prism of index `n` lands on the far wall (z). */
function shot(n: number): number {
  const g = prism("g", { x: 2, z: 0 }, 1.5, 15, n);
  return traceBeam({ segments: box(5), glass: [g] }, { x: 0, z: 0.1 }, { x: 1, z: 0 }).path.at(-1)!.z;
}

describe("beam tracer", () => {
  it("travels straight into a wall", () => {
    const r = traceBeam({ segments: box(5), glass: [] }, { x: 0, z: 0 }, { x: 1, z: 0 });
    expect(r.end).toBe("wall:e");
    expect(r.path.at(-1)!.x).toBeCloseTo(5);
  });

  it("a 45° mirror turns the beam 90°", () => {
    const scene: OpticsScene = { segments: [...box(5), mirrorSegment("m", { x: 2, z: 0 }, 1, 45)], glass: [] };
    const r = traceBeam(scene, { x: 0, z: 0 }, { x: 1, z: 0 });
    expect(r.end).toBe("wall:s");
    expect(r.path.at(-1)!.x).toBeCloseTo(2);
  });

  it("refracts by Snell's law through a slab and comes out parallel", () => {
    // A thick slab (square) at 30° incidence: exits parallel to the entry direction, shifted.
    const slab = { id: "g", n: 1.5, points: [{ x: 1, z: -3 }, { x: 2, z: -3 }, { x: 2, z: 3 }, { x: 1, z: 3 }] };
    const dir = { x: Math.cos(Math.PI / 6), z: Math.sin(Math.PI / 6) };
    const r = traceBeam({ segments: box(5), glass: [slab] }, { x: 0, z: 0 }, dir);
    expect(r.through).toEqual(["g"]);
    // Inside: sin(θt) = sin(30°)/1.5.
    const inside = { x: r.path[2].x - r.path[1].x, z: r.path[2].z - r.path[1].z };
    expect(Math.asin(inside.z / Math.hypot(inside.x, inside.z))).toBeCloseTo(Math.asin(0.5 / 1.5), 5);
    const out = { x: r.path[3].x - r.path[2].x, z: r.path[3].z - r.path[2].z };
    expect(Math.atan2(out.z, out.x)).toBeCloseTo(Math.PI / 6, 5);
  });

  it("an index of 1 doesn't bend the beam", () => {
    const g = prism("g", { x: 2, z: 0 }, 1.5, 15, 1);
    const r = traceBeam({ segments: box(5), glass: [g] }, { x: 0, z: 0.1 }, { x: 1, z: 0 });
    expect(r.end).toBe("wall:e");
    expect(r.path.at(-1)!.z).toBeCloseTo(0.1);
  });

  it("an index below 1 bends the beam the other way to an index above 1", () => {
    expect(Math.sign(shot(1.5) - 0.1)).toBe(-Math.sign(shot(0.7) - 0.1));
  });

  it("reports targets", () => {
    const scene: OpticsScene = {
      segments: [...box(5), { id: "eye", kind: "target", a: { x: 3, z: -0.2 }, b: { x: 3, z: 0.2 } }],
      glass: [],
    };
    expect(traceBeam(scene, { x: 0, z: 0 }, { x: 1, z: 0 }).end).toBe("target:eye");
  });
});
