// Alpha particles scattering off a gold atom, in 2D (the table's plane).
// Pure maths, sim side: no Rapier, no three.js, no DOM.
//
// The atom's positive charge is either spread evenly through a ball (Thomson's
// "plum pudding": the force grows linearly inside it and is weak everywhere) or
// concentrated in a tiny nucleus (Rutherford: Coulomb's 1/r² force, strong near
// it). A negative nucleus attracts instead. For a nucleus, the deflection θ of a
// particle passing at impact parameter b obeys tan(θ/2) = b₀ / b, with
// b₀ = K / v², so only a particle aimed almost dead-on bounces straight back.

export type Charge = "spread" | "nucleus" | "negative";

export interface Particle {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Still flying (false once it leaves the table or is swallowed). */
  alive: boolean;
  /** Swallowed by a negative nucleus. */
  absorbed: boolean;
  /** Steps since it was fired (for fading old tracks). */
  age: number;
}

/** Coulomb strength / mass (m³/s²): with SPEED, b₀ = K / SPEED² = 0.1 m. */
export const K = 0.4;
export const SPEED = 2;
/** The pudding's radius (m): its charge is spread through this ball. */
export const PUDDING_RADIUS = 1.5;
/** A negative nucleus swallows anything that comes this close (m). */
const CAPTURE = 0.05;
const SOFTENING = 0.004;
const SUBSTEPS = 8;

/** Acceleration on a particle at offset (dx, dz) from the atom's centre. */
export function acceleration(charge: Charge, dx: number, dz: number): [number, number] {
  const r2 = dx * dx + dz * dz + SOFTENING * SOFTENING;
  const r = Math.sqrt(r2);
  let a: number; // along the outward radius
  if (charge === "spread") a = r < PUDDING_RADIUS ? (K * r) / PUDDING_RADIUS ** 3 : K / r2;
  else a = (charge === "nucleus" ? 1 : -1) * (K / r2);
  return [(a * dx) / r, (a * dz) / r];
}

/** Advances a particle by dt seconds around an atom at (ax, az); `bounds` is the table. */
export function stepParticle(p: Particle, charge: Charge, ax: number, az: number, dt: number, bounds: { x0: number; x1: number; z0: number; z1: number }): void {
  if (!p.alive) return;
  const h = dt / SUBSTEPS;
  for (let i = 0; i < SUBSTEPS; i++) {
    // Velocity Verlet (kick-drift-kick): steady through the close pass.
    let [axl, azl] = acceleration(charge, p.x - ax, p.z - az);
    p.vx += 0.5 * h * axl;
    p.vz += 0.5 * h * azl;
    p.x += h * p.vx;
    p.z += h * p.vz;
    [axl, azl] = acceleration(charge, p.x - ax, p.z - az);
    p.vx += 0.5 * h * axl;
    p.vz += 0.5 * h * azl;
    if (charge === "negative" && Math.hypot(p.x - ax, p.z - az) < CAPTURE) {
      p.alive = false;
      p.absorbed = true;
      return;
    }
  }
  p.age++;
  if (p.x < bounds.x0 || p.x > bounds.x1 || p.z < bounds.z0 || p.z > bounds.z1) p.alive = false;
}
