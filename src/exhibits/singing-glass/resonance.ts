// Resonance for the Singing Glass: organ pipes and the glasses they can ring.
// Pure maths, sim side: no Rapier, no three.js, no DOM (like optics/trace.ts).
//
// An open pipe of length L sounds at f = v / 2L, so the speed of sound v tunes
// every pipe at once. A glass has its own frequency f0 (which doesn't depend on
// v) and quality Q. Real frequencies of hundreds of hertz can't be integrated
// at 60 Hz, so each glass tracks the *envelope* of its vibration, A:
//
//   dA/dt = −A/τ + k · L(f, f0, Q),   L = 1 / (1 + (2Q (f − f0) / f0)²)
//
// integrated exactly over each step. A ≥ 0.5 shows a crack; A ≥ 1 shatters it.
// With no pipe sounding, A decays, so a player who stops at the crack is safe.

export interface GlassSpec {
  id: string;
  /** Natural frequency (Hz). */
  f0: number;
  /** Quality factor: how sharply it responds (higher = narrower). */
  q: number;
  /** Ring-up rate at exact resonance (1/s). */
  k: number;
  /** Decay time (s). */
  tau: number;
  /** Decoys only ring: their amplitude never reaches the crack. */
  decoy?: boolean;
}

export interface GlassState {
  amplitude: number;
  cracked: boolean;
  broken: boolean;
}

export const CRACK_AT = 0.5;
export const BREAK_AT = 1;
/** Decoys ring up to this at most, short of a crack. */
const DECOY_CAP = 0.45;

/** An open pipe's fundamental (Hz). */
export function pipeFrequency(speed: number, length: number): number {
  return speed / (2 * length);
}

/** How strongly a glass responds to a tone (1 at exact resonance). */
export function response(f: number, glass: GlassSpec): number {
  const detune = (2 * glass.q * (f - glass.f0)) / glass.f0;
  return 1 / (1 + detune * detune);
}

/** Advances one glass by dt seconds with tone `f` (Hz, or null for silence). */
export function ringGlass(state: GlassState, glass: GlassSpec, f: number | null, dt: number): GlassState {
  if (state.broken) return state;
  const decay = Math.exp(-dt / glass.tau);
  const drive = f === null ? 0 : glass.k * glass.tau * response(f, glass);
  let amplitude = state.amplitude * decay + drive * (1 - decay);
  if (glass.decoy) amplitude = Math.min(amplitude, DECOY_CAP);
  return {
    amplitude,
    cracked: state.cracked || amplitude >= CRACK_AT,
    broken: amplitude >= BREAK_AT,
  };
}
