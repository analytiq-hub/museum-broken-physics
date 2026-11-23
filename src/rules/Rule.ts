// A physical law of a room that the instrument can inspect and (maybe) change.
// Sim only: no three.js, no DOM.
import type RAPIER from "@dimforge/rapier3d-compat";

/** What a rule needs to push its value into the simulation. */
export interface SimContext {
  R: typeof RAPIER;
  world: RAPIER.World;
}

export interface RuleOption<T> {
  label: string;
  value: T;
}

export interface Rule<T = unknown> {
  /** Stable id, e.g. "gravity" or "pendulum.damping". */
  readonly id: string;
  /** Shown on the instrument. */
  readonly label: string;
  readonly kind: "choice" | "range";
  /** For "choice" rules. */
  readonly options?: readonly RuleOption<T>[];
  /** For "range" rules. */
  readonly range?: { min: number; max: number; step: number };
  /**
   * For "range" rules: the named settings the instrument offers (and the solver
   * samples). Each is a choice the player can make.
   */
  readonly marks?: readonly RuleOption<T>[];
  /** Optional plain-language "what's wrong" sentence for the instrument. */
  explain?(current: T, nominal: T): string;
  current: T;
  /** The "correct" law. Drives Restore and later trade-offs. */
  readonly nominal: T;
  /** May the instrument change it in this room? */
  readonly editable: boolean;
  /** Pushes `current` into the world, bodies or colliders. */
  apply(ctx: SimContext): void;
}

export type Vec3 = { x: number; y: number; z: number };

/** Gravity options used across exhibits. */
export const GRAVITY = {
  down: { x: 0, y: -9.81, z: 0 },
  east: { x: 9.81, y: 0, z: 0 },
  west: { x: -9.81, y: 0, z: 0 },
  north: { x: 0, y: 0, z: -9.81 },
  south: { x: 0, y: 0, z: 9.81 },
  /** Halfway between the floor and the north (−z) wall. */
  "north-down": { x: 0, y: -9.81 * Math.SQRT1_2, z: -9.81 * Math.SQRT1_2 },
  /** Halfway between the floor and the south (+z) wall. */
  "south-down": { x: 0, y: -9.81 * Math.SQRT1_2, z: 9.81 * Math.SQRT1_2 },
} as const satisfies Record<string, Vec3>;

export type GravityDirection = keyof typeof GRAVITY;

/**
 * World gravity as a "choice" rule. Applying it wakes every dynamic body,
 * because sleeping bodies ignore gravity changes.
 */
export function gravityRule(
  initial: GravityDirection,
  options: readonly GravityDirection[],
  labels: Partial<Record<GravityDirection, string>> = {},
  editable = true,
): Rule<GravityDirection> {
  return {
    id: "gravity",
    label: "Gravity",
    kind: "choice",
    options: options.map((value) => ({ label: labels[value] ?? value, value })),
    current: initial,
    nominal: "down",
    editable,
    apply({ world }) {
      world.gravity = { ...GRAVITY[this.current] };
      world.forEachRigidBody((body) => {
        if (body.isDynamic()) body.wakeUp();
      });
    },
  };
}
