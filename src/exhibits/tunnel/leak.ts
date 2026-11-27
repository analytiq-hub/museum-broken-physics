// Tunnelling between three compartments: where a marble's probability is.
// Pure maths, sim side: no Rapier, no three.js, no DOM.
//
// With Planck's constant enormous, a marble is a spread-out wave and leaks through
// thin glass walls. Its probability flows from the well into the cup (which lies
// lower, so the flow back is weaker) and from the cup into the drain (a sink):
//   dP_well/dt  = −f·P_well + b·P_cup
//   dP_cup/dt   =  f·P_well − b·P_cup − d·P_cup
//   dP_drain/dt =  d·P_cup
// The rates grow with Planck's constant; at its true, tiny value they vanish.
// Measuring the marble (putting the constant right) collapses it into whichever
// compartment holds the most probability.

export type Compartment = "well" | "cup" | "drain";
export type Probabilities = Record<Compartment, number>;

/** Leak rates (1/s) for a Planck's constant this many times the "huge" mark. */
export function rates(scale: number): { f: number; b: number; d: number } {
  return { f: 0.3 * scale, b: 0.05 * scale, d: 0.1 * scale };
}

/** Advances the probabilities by dt seconds (small dt: explicit Euler is exact enough at 60 Hz). */
export function leak(p: Probabilities, scale: number, dt: number): Probabilities {
  if (scale === 0) return p;
  const { f, b, d } = rates(scale);
  const toCup = (f * p.well - b * p.cup) * dt;
  const toDrain = d * p.cup * dt;
  return { well: p.well - toCup, cup: p.cup + toCup - toDrain, drain: p.drain + toDrain };
}

/** Where a measurement finds the marble: the compartment with the most probability. */
export function collapse(p: Probabilities): Compartment {
  return (Object.keys(p) as Compartment[]).reduce((best, c) => (p[c] > p[best] ? c : best), "well");
}
