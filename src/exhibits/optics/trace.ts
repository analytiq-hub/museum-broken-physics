// 2D light-beam tracer for the optics gallery, in the horizontal (x, z) plane.
// Mirrors reflect, glass refracts by Snell's law (with total internal
// reflection), walls absorb, targets absorb and report a hit. Pure maths: no
// three.js, no Rapier, no DOM.

export interface Vec2 {
  x: number;
  z: number;
}

export interface Segment {
  id: string;
  kind: "mirror" | "wall" | "target";
  a: Vec2;
  b: Vec2;
}

/** A convex glass polygon (points in order) with a refractive index. */
export interface Glass {
  id: string;
  points: Vec2[];
  n: number;
}

export interface OpticsScene {
  segments: Segment[];
  glass: Glass[];
}

export interface BeamResult {
  /** Points along the beam: origin, every bounce/refraction, the end. */
  path: Vec2[];
  /** What stopped the beam ("wall:…", "target:…"), or "lost" if it ran out of bounces. */
  end: string;
  /** Where on the stopping segment it hit (0..1 from a to b), for walls and targets. */
  endT?: number;
  /** Ids of glass the beam passed through. */
  through: string[];
}

const EPS = 1e-6;
const MAX_EVENTS = 40;

const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
const cross = (a: Vec2, b: Vec2) => a.x * b.z - a.z * b.x;
const norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a.x, a.z);
  return { x: a.x / l, z: a.z / l };
};

/** Ray p + t·d against segment a–b: returns t and the segment parameter s, or undefined. */
function hitSegment(p: Vec2, d: Vec2, a: Vec2, b: Vec2): { t: number; s: number } | undefined {
  const e = sub(b, a);
  const denom = cross(d, e);
  if (Math.abs(denom) < 1e-12) return undefined;
  const ap = sub(a, p);
  const t = cross(ap, e) / denom;
  const s = cross(ap, d) / denom;
  if (t <= EPS || s < -1e-9 || s > 1 + 1e-9) return undefined;
  return { t, s };
}

/** Unit normal of edge a→b (either side; callers orient it against the ray). */
function edgeNormal(a: Vec2, b: Vec2): Vec2 {
  const e = norm(sub(b, a));
  return { x: -e.z, z: e.x };
}

function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

/** Traces a beam from `origin` along `direction` through the scene. */
export function traceBeam(scene: OpticsScene, origin: Vec2, direction: Vec2): BeamResult {
  let p = origin;
  let d = norm(direction);
  const path: Vec2[] = [p];
  const through = new Set<string>();
  // Which glass (if any) the beam is currently inside.
  let inside: Glass | undefined = scene.glass.find((g) => pointInPolygon(p, g.points));

  for (let event = 0; event < MAX_EVENTS; event++) {
    let best: { t: number; s: number; kind: "segment" | "glass"; seg?: Segment; glass?: Glass; a: Vec2; b: Vec2 } | undefined;
    for (const seg of scene.segments) {
      const h = hitSegment(p, d, seg.a, seg.b);
      if (h && (!best || h.t < best.t)) best = { ...h, kind: "segment", seg, a: seg.a, b: seg.b };
    }
    for (const g of scene.glass) {
      for (let i = 0; i < g.points.length; i++) {
        const a = g.points[i];
        const b = g.points[(i + 1) % g.points.length];
        const h = hitSegment(p, d, a, b);
        if (h && (!best || h.t < best.t)) best = { ...h, kind: "glass", glass: g, a, b };
      }
    }
    if (!best) {
      path.push({ x: p.x + d.x * 100, z: p.z + d.z * 100 });
      return { path, end: "lost", through: [...through] };
    }

    const hit = { x: p.x + d.x * best.t, z: p.z + d.z * best.t };
    path.push(hit);

    if (best.kind === "segment") {
      const seg = best.seg!;
      if (seg.kind === "mirror") {
        const n = edgeNormal(seg.a, seg.b);
        const k = 2 * dot(d, n);
        d = norm({ x: d.x - k * n.x, z: d.z - k * n.z });
        p = hit;
        continue;
      }
      return { path, end: `${seg.kind}:${seg.id}`, endT: best.s, through: [...through] };
    }

    // Glass boundary: refract (Snell) or totally internally reflect.
    const g = best.glass!;
    let n = edgeNormal(best.a, best.b);
    if (dot(n, d) > 0) n = { x: -n.x, z: -n.z }; // normal against the ray
    const entering = inside !== g;
    const n1 = entering ? 1 : g.n;
    const n2 = entering ? g.n : 1;
    const eta = n1 / n2;
    const cosI = -dot(n, d);
    const sin2T = eta * eta * (1 - cosI * cosI);
    if (sin2T > 1) {
      // Total internal reflection: stays on the same side.
      const k = 2 * dot(d, n);
      d = norm({ x: d.x - k * n.x, z: d.z - k * n.z });
    } else {
      const cosT = Math.sqrt(1 - sin2T);
      d = norm({ x: eta * d.x + (eta * cosI - cosT) * n.x, z: eta * d.z + (eta * cosI - cosT) * n.z });
      inside = entering ? g : undefined;
      through.add(g.id);
    }
    p = hit;
  }
  return { path, end: "lost", through: [...through] };
}

/** A mirror of `length` centred at `c`, turned `degrees` from the x axis. */
export function mirrorSegment(id: string, c: Vec2, length: number, degrees: number): Segment {
  const a = (degrees * Math.PI) / 180;
  const h = length / 2;
  return {
    id,
    kind: "mirror",
    a: { x: c.x - Math.cos(a) * h, z: c.z - Math.sin(a) * h },
    b: { x: c.x + Math.cos(a) * h, z: c.z + Math.sin(a) * h },
  };
}

/** A regular-ish triangle (equilateral) of `side`, centred at `c`, rotated `degrees`. */
export function prism(id: string, c: Vec2, side: number, degrees: number, n: number): Glass {
  const r = side / Math.sqrt(3);
  const points = [0, 120, 240].map((k) => {
    const a = ((degrees + k) * Math.PI) / 180;
    return { x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r };
  });
  return { id, points, n };
}
