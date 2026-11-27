// Two-slit interference, closed form. Pure maths, sim side: no Rapier, no three.js.
//
// Light of wavelength λ (in vacuum) through two slits d apart, travelling a distance
// L through a medium of refractive index n to a screen: inside the medium its
// wavelength is λ / n, so bright bands are spaced Δ = λ L / (n d). Intensity at a
// distance y from the centre: I = cos²(π y / Δ) · envelope(y). With a detector
// watching the slits ("which way did it go?"), the bands vanish: I = envelope / 2.

export interface Optics {
  /** Wavelength in vacuum (nm). */
  wavelength: number;
  /** Refractive index between the slits and the screen. */
  index: number;
  /** Is the observer watching the slits? */
  observed: boolean;
}

/** Slit separation and slit-to-screen distance (m). */
export const SLITS = { d: 0.0000236, L: 8 } as const;
/** The envelope's half-width on the screen (m): the single-slit spread, simplified to a Gaussian. */
export const ENVELOPE = 1.6;

/** Fringe spacing on the screen (m). */
export function spacing(o: Optics): number {
  return (o.wavelength * 1e-9 * SLITS.L) / (o.index * SLITS.d);
}

/** Relative intensity at screen position y (m from the centre), 0..1. */
export function intensity(o: Optics, y: number): number {
  const envelope = Math.exp(-((y / ENVELOPE) ** 2));
  if (o.observed) return envelope / 2;
  const c = Math.cos((Math.PI * y) / spacing(o));
  return envelope * c * c;
}

/** The bands alone (without the envelope), 0..1: what the sensor judges. */
export function fringe(o: Optics, y: number): number {
  if (o.observed) return 0.5;
  const c = Math.cos((Math.PI * y) / spacing(o));
  return c * c;
}

/** An approximate colour for a wavelength (nm), as linear 0..1 RGB. */
export function wavelengthColour(nm: number): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  if (nm < 440) [r, g, b] = [(440 - nm) / 60, 0, 1];
  else if (nm < 490) [r, g, b] = [0, (nm - 440) / 50, 1];
  else if (nm < 510) [r, g, b] = [0, 1, (510 - nm) / 20];
  else if (nm < 580) [r, g, b] = [(nm - 510) / 70, 1, 0];
  else if (nm < 645) [r, g, b] = [1, (645 - nm) / 65, 0];
  else [r, g, b] = [1, 0, 0];
  // Dimmer toward the edges of what eyes can see.
  const edge = nm < 420 ? 0.4 + (0.6 * (nm - 380)) / 40 : nm > 700 ? Math.max(0.35, 1 - (0.65 * (nm - 700)) / 80) : 1;
  return [r * edge, g * edge, b * edge];
}
