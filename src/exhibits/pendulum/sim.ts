// Exhibit 2: the Restless Pendulum. Sim only: no three.js, no DOM.
//
// A heavy brass bob on a 5.2 m rod swings across the gallery. The broken law is
// damping: it is negative, so every swing gains energy. Two bells hang on the
// bob's arc, at 40° on one side and 65° on the other; a glass vase sits at 80°.
//
// Goal: let the swing grow until both bells have rung (the broken law is
// useful!), then restore drag before the bob reaches the vase, and let the
// pendulum come to rest. Fail: the vase breaks, or the swing passes 85° and
// the room shakes itself apart.
//
// Negative damping is implemented as an explicit, capped impulse along the
// bob's velocity each step, never as a negative engine damping value.
//
// The gallery sits west of Gallery I, joined by the shared corridor. The
// pendulum swings in the y–z plane (left–right as the player walks in, facing
// west); its lowest point is 2.4 m up, above the player's head.
import type RAPIER from "@dimforge/rapier3d-compat";
import { groups, GROUP, ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, CORRIDOR_1_2, CORRIDOR_2_3, type Box } from "../layout";

/** Interior: x −25..−15, y 0..8, z −6..6. */
export const ROOM = { xMin: -25, xMax: -15, halfZ: 6, height: 8 } as const;
const W = 0.25;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const HX = (ROOM.xMax - ROOM.xMin) / 2;

export const PIVOT = { x: -20, y: 7.6, z: 0 } as const;
export const ROD_LENGTH = 5.2;
export const BOB_RADIUS = 0.35;
/** The bob starts held at this angle (degrees, negative = north side). */
export const START_ANGLE = -25;

/** Targets on the bob's arc, by swing angle (degrees; positive = south side, toward +z). */
export const BELLS = [
  { name: "bell-low", angle: 40, label: "Low bell" },
  { name: "bell-high", angle: -65, label: "High bell" },
] as const;
export const VASE = { name: "vase", angle: 80 } as const;
/** Past this swing the gallery shakes itself apart. */
export const MAX_SWING = 85;
/** At rest means swinging less than this (degrees)... */
export const REST_SWING = 8;
/** ...for this many steps (2 s). */
const REST_STEPS = 120;
/** Half-size of each target's sensor box (m). */
const TARGET_HALF = 0.3;
/** Energy cap for the damping impulse, as a swing angle: the force never pushes past it. */
const ENERGY_CAP_ANGLE = 88;

/** Damping settings the instrument offers (1/s; negative adds energy). */
export const DAMPING_MARKS = [
  { value: -0.15, label: "Strong push (−0.15)" },
  { value: -0.08, label: "Gentle push (−0.08)" },
  { value: 0, label: "None (0)" },
  { value: 0.15, label: "Light drag (+0.15)" },
  { value: 0.4, label: "Heavy drag (+0.4)" },
] as const;
export const DAMPING_BROKEN = -0.08;
export const DAMPING_LAW = 0.15;

/** Where the player enters from the corridor. */
export const ENTRANCE = { x: -15.6, y: 0, z: 2 } as const;

export const STATIC_BOXES: readonly Box[] = [
  { name: "floor", kind: "floor", center: [CX, -W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "ceiling", kind: "ceiling", center: [CX, ROOM.height + W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  // West wall, with a door to Gallery III at z 1..3, y 0..3 (opens when solved).
  { name: "west-north", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, -2.75], half: [W, ROOM.height / 2, 3.75] },
  { name: "west-south", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, 4.75], half: [W, ROOM.height / 2, 1.75] },
  { name: "west-lintel", kind: "wall", center: [ROOM.xMin - W, 5.5, 2], half: [W, 2.5, 1] },
  { name: "north", kind: "wall", center: [CX, ROOM.height / 2, -ROOM.halfZ - W], half: [HX + 0.5, ROOM.height / 2, W] },
  { name: "south", kind: "wall", center: [CX, ROOM.height / 2, ROOM.halfZ + W], half: [HX + 0.5, ROOM.height / 2, W] },
  // East wall, with the doorway from the corridor at z 1..3, y 0..3.
  { name: "east-north", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, -2.75], half: [W, ROOM.height / 2, 3.75] },
  { name: "east-south", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, 4.75], half: [W, ROOM.height / 2, 1.75] },
  { name: "east-lintel", kind: "wall", center: [ROOM.xMax + W, 5.5, 2], half: [W, 2.5, 1] },
  ...CORRIDOR_1_2,
  ...CORRIDOR_2_3,
];

/** The west door, which sinks into the floor once the room is solved. */
export const DOOR: Box = { name: "door", kind: "wall", center: [ROOM.xMin - W, 1.5, 2], half: [W, 1.5, 1] };
const DOOR_DROP = 3.1;
const DOOR_OPEN_SECONDS = 1.2;
/** Resetting closes the door: a player in the doorway or beyond is moved back to this spot. */
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

/** Position on the bob's arc at `angle` degrees. */
export function arcPoint(angle: number): { x: number; y: number; z: number } {
  const a = (angle * Math.PI) / 180;
  return { x: PIVOT.x, y: PIVOT.y - ROD_LENGTH * Math.cos(a), z: PIVOT.z + ROD_LENGTH * Math.sin(a) };
}

export interface PendulumOptions {
  budget?: number;
  /** Starting angle (degrees); jittered by the solver's robustness check. */
  startAngle?: number;
}

interface PendulumExtra {
  rung: string[];
  vaseBroken: boolean;
  shookApart: boolean;
  restSteps: number;
  solved: boolean;
  /** Largest |angle| since the last zero crossing, and the latest completed swing's amplitude. */
  peak: number;
  amplitude: number;
  lastSign: number;
  doorProgress: number;
}

export class PendulumExhibit extends ExhibitBase {
  private readonly bobHandle: number;
  private readonly bobColliderHandle: number;
  private readonly targetHandles = new Map<string, number>();
  private readonly bobMass: number;
  private readonly doorHandle: number;
  private s: PendulumExtra = {
    rung: [],
    vaseBroken: false,
    shookApart: false,
    restSteps: 0,
    solved: false,
    peak: 0,
    amplitude: 0,
    lastSign: 0,
    doorProgress: 0,
  };

  constructor(R: typeof RAPIER, options: PendulumOptions = {}) {
    super("pendulum", R, options.budget ?? 2);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);

    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;

    // Targets: sensors on the arc, slightly beyond where the bob's edge reaches at that angle.
    for (const target of [...BELLS, VASE]) {
      const p = arcPoint(target.angle);
      const c = world.createCollider(
        R.ColliderDesc.cuboid(TARGET_HALF, TARGET_HALF, TARGET_HALF)
          .setTranslation(p.x, p.y, p.z)
          .setSensor(true)
          .setCollisionGroups(ROOM_GROUPS),
        statics,
      );
      this.targetHandles.set(target.name, c.handle);
    }

    // The bob: hangs on a revolute joint about x (swings in y–z). It touches only the
    // room (and its sensors), never the player or tell-tales.
    const start = arcPoint(options.startAngle ?? START_ANGLE);
    const bob = world.createRigidBody(
      R.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true),
    );
    const collider = world.createCollider(
      R.ColliderDesc.ball(BOB_RADIUS).setDensity(7.8).setCollisionGroups(groups(GROUP.ball, GROUP.room)),
      bob,
    );
    this.bobHandle = bob.handle;
    this.bobColliderHandle = collider.handle;
    this.bobMass = bob.mass();
    const toPivot = { x: PIVOT.x - start.x, y: PIVOT.y - start.y, z: PIVOT.z - start.z };
    world.createImpulseJoint(R.JointData.revolute(PIVOT, toPivot, { x: 1, y: 0, z: 0 }), statics, bob, true);

    this.rules = [dampingRule(), gravityRule("down", ["down"], { down: "Floor" }, false)];
    this.finishSetup();
  }

  get bob(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.bobHandle);
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  /** Current swing angle in degrees (positive = south, +z). */
  get angle(): number {
    const p = this.bob.translation();
    return (Math.atan2(p.z - PIVOT.z, PIVOT.y - p.y) * 180) / Math.PI;
  }

  /** How wide the pendulum is swinging (degrees): the larger of the last and current half-swing. */
  get amplitude(): number {
    return Math.max(this.s.amplitude, this.s.peak, Math.abs(this.angle));
  }

  /** Targets struck so far, in order. */
  get rung(): readonly string[] {
    return this.s.rung;
  }

  get vaseBroken(): boolean {
    return this.s.vaseBroken;
  }

  get shookApart(): boolean {
    return this.s.shookApart;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && (this.s.vaseBroken || this.s.shookApart);
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { bob: this.bob };
  }

  protected settleBodies(): RAPIER.RigidBody[] {
    return [this.bob];
  }

  /** Damping: an impulse along the bob's velocity, −c·m·v·dt, never pushing past the energy cap. */
  protected beforeStep(): void {
    if (this.s.solved && this.s.doorProgress < 1) {
      this.s.doorProgress = Math.min(1, this.s.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
      const [x, y, z] = DOOR.center;
      const t = this.s.doorProgress;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.door.setNextKinematicTranslation({ x, y: y - DOOR_DROP * eased, z });
    }
    if (this.isFailed()) return;
    const c = this.rule("damping").current as number;
    if (c === 0) return;
    const bob = this.bob;
    const v = bob.linvel();
    const g = 9.81;
    const height = bob.translation().y - (PIVOT.y - ROD_LENGTH);
    const energy = g * height + 0.5 * (v.x * v.x + v.y * v.y + v.z * v.z); // per unit mass
    const cap = g * ROD_LENGTH * (1 - Math.cos((ENERGY_CAP_ANGLE * Math.PI) / 180));
    if (c < 0 && energy >= cap) return;
    const k = -c * this.bobMass * this.world.timestep;
    bob.applyImpulse({ x: k * v.x, y: k * v.y, z: k * v.z }, true);
  }

  protected afterStep(): void {
    if (this.isFailed() || this.s.solved) return;
    const angle = this.angle;

    // Track the swing's amplitude: the peak |angle| between zero crossings.
    const sign = Math.sign(angle);
    if (sign !== 0 && sign !== this.s.lastSign) {
      if (this.s.lastSign !== 0) this.s.amplitude = this.s.peak;
      this.s.peak = 0;
      this.s.lastSign = sign;
    }
    this.s.peak = Math.max(this.s.peak, Math.abs(angle));

    const bob = this.world.getCollider(this.bobColliderHandle);
    for (const target of BELLS) {
      if (this.s.rung.includes(target.name)) continue;
      const sensor = this.world.getCollider(this.targetHandles.get(target.name)!);
      if (this.world.intersectionPair(sensor, bob)) this.s.rung.push(target.name);
    }
    const vase = this.world.getCollider(this.targetHandles.get(VASE.name)!);
    if (this.world.intersectionPair(vase, bob)) this.s.vaseBroken = true;
    if (Math.abs(angle) > MAX_SWING) this.s.shookApart = true;

    const allRung = BELLS.every((b) => this.s.rung.includes(b.name));
    const atRest = Math.max(this.s.peak, Math.abs(angle)) < REST_SWING && this.s.amplitude < REST_SWING;
    this.s.restSteps = allRung && atRest ? this.s.restSteps + 1 : 0;
    if (this.s.restSteps >= REST_STEPS && !this.isFailed()) this.s.solved = true;
  }

  protected saveExtra(): PendulumExtra {
    return this.s;
  }

  protected loadExtra(extra: PendulumExtra): void {
    this.s = extra;
  }
}

function dampingRule(): Rule<number> {
  return {
    id: "damping",
    label: "Damping",
    kind: "range",
    range: { min: -0.15, max: 0.4, step: 0.01 },
    marks: DAMPING_MARKS,
    current: DAMPING_BROKEN,
    nominal: DAMPING_LAW,
    editable: true,
    explain: (current, nominal) =>
      current < 0
        ? `Damping should be a light drag (+${nominal}/s) that slowly calms any swing. Here it is negative (${current}/s): every swing gains energy.`
        : current === 0
          ? `Damping should be a light drag (+${nominal}/s). Here there is none: the swing keeps its energy forever.`
          : `Damping should be a light drag (+${nominal}/s). Here it is ${current}/s.`,
    // Applied as an impulse in PendulumExhibit.beforeStep; nothing to push into the world.
    apply() {},
  };
}
