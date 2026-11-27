// A vibrating square plate: its modes and how a driving note excites them.
// Pure maths, sim side: no Rapier, no three.js, no DOM.
//
// Mode (n, m) of a free square plate is approximated by
//   φ(x, y) = cos(nπx) cos(mπy) + s · cos(mπx) cos(nπy)
// with frequency f = c · K · (n² + m²), c the speed of sound in the plate. A note
// at frequency f excites each mode by a resonance curve of quality Q. Sand gathers
// where the mixed vibration is still: the nodal lines (the view draws that).

export interface Mode {
  n: number;
  m: number;
  /** +1 or −1: which of the two degenerate shapes this plate prefers. */
  sign: number;
  /** n² + m²: frequency ∝ this. */
  k: number;
}

/** The plate's modes: every n < m ≤ 7, one shape each. */
export const MODES: readonly Mode[] = (() => {
  const modes: Mode[] = [];
  for (let n = 1; n <= 6; n++) for (let m = n + 1; m <= 7; m++) modes.push({ n, m, sign: (n + m) % 2 === 0 ? -1 : 1, k: n * n + m * m });
  return modes;
})();

/** Frequency scale: f = c · K · k. */
export const K = 0.04;
export const Q = 40;

export function modeFrequency(speed: number, mode: Mode): number {
  return speed * K * mode.k;
}

/** How strongly each mode answers a note at `f` Hz (1 at exact resonance). */
export function modeWeights(speed: number, f: number | null): number[] {
  if (f === null) return MODES.map(() => 0);
  return MODES.map((mode) => {
    const f0 = modeFrequency(speed, mode);
    const d = (2 * Q * (f - f0)) / f0;
    return 1 / (1 + d * d);
  });
}

/** The mode's shape at (x, y) in 0..1. */
export function modeShape(mode: Mode, x: number, y: number): number {
  const { n, m, sign } = mode;
  return Math.cos(n * Math.PI * x) * Math.cos(m * Math.PI * y) + sign * Math.cos(m * Math.PI * x) * Math.cos(n * Math.PI * y);
}

export const modeIndex = (n: number, m: number) => MODES.findIndex((mode) => mode.n === n && mode.m === m);
