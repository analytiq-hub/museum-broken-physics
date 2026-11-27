// Heat for the Backwards Furnace: a lumped thermal network. Pure maths, sim side:
// no Rapier, no three.js, no DOM (like optics/trace.ts).
//
// Nodes (ice plug, stove, wax seal) each have a heat capacity and exchange heat
// with the room, a reservoir far too big to change temperature:
//   into i:  s · k_i · (T_room − T_i)
// where s = +1 under the law (heat flows from hot to cold) and −1 when the law is
// broken (from cold to hot: anything warmer than the room pulls heat in and runs
// away). A lamp's beam adds power to whichever node it hits. (A shared air node
// was tried: under the broken law the air itself ran away to −60 °C and dragged
// every object into a runaway, beam or no beam.)
// Broken laws are explicit and capped (CLAUDE.md): temperatures are clamped.
//
// The ice has latent heat: at 0 °C it stays at 0 °C while it melts; the meltwater
// then warms (or, under the broken law, runs away to boiling).

export type HeatNode = "ice" | "stove" | "wax";

export const NODES: readonly HeatNode[] = ["ice", "stove", "wax"];
/** Heat capacity of each node. */
export const CAPACITY: Record<HeatNode, number> = { ice: 1, stove: 2, wax: 1 };
/** How well each node exchanges heat with the room. */
export const CONDUCTANCE: Record<HeatNode, number> = { ice: 0.25, stove: 0.3, wax: 0.25 };
/** The room's temperature (°C). */
export const ROOM_T = -8;
/** Energy to melt the ice plug (in heat-capacity × °C). */
export const LATENT = 16;
/** The beam's power on whatever it hits. */
export const BEAM_POWER = 1.25;
export const T_MIN = -60;
export const T_MAX = 400;
export const BOILING = 100;
export const WAX_MELTS = 60;

export interface HeatState {
  T: Record<HeatNode, number>;
  /** How much of the ice has melted, 0..1. */
  melted: number;
}

export function initialHeat(): HeatState {
  // The stove holds a little old warmth: under the broken law, that is enough to run away.
  return { T: { ice: ROOM_T, stove: ROOM_T + 3, wax: ROOM_T }, melted: 0 };
}

/** One step of dt seconds. `sign` is +1 (the law) or −1 (broken); `beam` is the node the beam hits. */
export function stepHeat(state: HeatState, sign: number, beam: HeatNode | null, dt: number): HeatState {
  const flow: Record<HeatNode, number> = { ice: 0, stove: 0, wax: 0 };
  for (const node of NODES) flow[node] = sign * CONDUCTANCE[node] * (ROOM_T - state.T[node]);
  if (beam) flow[beam] += BEAM_POWER;
  const T = { ...state.T };
  let melted = state.melted;
  for (const node of NODES) {
    const energy = flow[node] * dt;
    if (node === "ice" && melted < 1) [T.ice, melted] = iceStep(T.ice, melted, energy);
    else T[node] += energy / CAPACITY[node];
    T[node] = Math.min(T_MAX, Math.max(T_MIN, T[node]));
  }
  return { T, melted };
}

/** The ice plug: warms to 0 °C, then melts (latent heat), then the water warms; and back. */
function iceStep(T: number, melted: number, energy: number): [number, number] {
  const C = CAPACITY.ice;
  if (energy > 0) {
    const toZero = Math.max(0, -T) * C;
    if (energy <= toZero) return [T + energy / C, melted];
    const rest = energy - toZero;
    const melt = Math.min(1 - melted, rest / LATENT);
    const left = rest - melt * LATENT;
    return [left / C, melted + melt]; // left > 0 only once it has all melted
  }
  if (melted > 0) {
    const freeze = Math.min(melted, -energy / LATENT);
    return [(energy + freeze * LATENT) / C, melted - freeze];
  }
  return [T + energy / C, melted];
}
