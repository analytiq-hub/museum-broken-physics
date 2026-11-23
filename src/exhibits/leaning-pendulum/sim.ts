// Exhibit 3: the Leaning Pendulum. Two broken laws, and the order you fix
// them in matters. Sim only: no three.js, no DOM.
//
// Gravity leans toward the north (−z) wall, so the pendulum hangs sideways,
// and damping is negative, so its swing grows. A bell is mounted above the
// pivot on the north wall: it can only be reached while gravity is broken.
//
// Goal: ring the bell, then put both laws right (gravity to the floor, damping
// to a drag) and bring the pendulum to rest.
//
// The trade-off: the pendulum tears loose if it ever swings more than 65° from
// where gravity says it should hang. Setting gravity straight back to the floor
// drops it 90°, which tears it loose; so you calm it first (drag), then bring
// gravity home in stages through "floor, leaning north" (45°).
//
// Angles are measured from straight down, positive toward +z (south).
import type RAPIER from "@dimforge/rapier3d-compat";
import { groups, GROUP, ROOM_GROUPS } from "../../engine/groups";
import { GRAVITY, gravityRule, type GravityDirection, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, CORRIDOR_2_3, CORRIDOR_3_4, type Box } from "../layout";
import { DAMPING_BROKEN, DAMPING_LAW, DAMPING_MARKS } from "../pendulum/sim";

/** Interior: x −44..−34, y 0..12, z −5.5..5.5. */
export const ROOM = { xMin: -44, xMax: -34, halfZ: 5.5, height: 12 } as const;
const W = 0.25;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const HX = (ROOM.xMax - ROOM.xMin) / 2;

/** The pivot hangs from an arm out of the west wall, clear of the swing plane. */
export const PIVOT = { x: -39, y: 7, z: 0 } as const;
export const ROD_LENGTH = 4.6;
export const BOB_RADIUS = 0.35;
/** The bell, above the pivot on the north wall (degrees from straight down). */
export const BELL = { name: "bell", angle: -115, label: "Bell" } as const;
/** The pendulum starts this far (degrees) from where broken gravity says it should hang. */
export const START_OFFSET = 12;
/** More than this from gravity's hanging direction tears the pendulum loose. */
export const TEAR_LOOSE = 65;
/** At rest: within this many degrees of hanging straight... */
export const REST = 8;
/** ...for this many steps (2 s). */
const REST_STEPS = 120;
const TARGET_HALF = 0.3;
/** The damping push never adds energy beyond this deviation (just past tearing loose). */
const ENERGY_CAP = 68;

/** Viewer-relative names: the player walks in facing west, so north (−z) is on their right. */
export const GRAVITY_LABELS: Partial<Record<GravityDirection, string>> = {
  down: "Floor",
  north: "Right wall",
  south: "Left wall",
  "north-down": "Floor, leaning right",
  "south-down": "Floor, leaning left",
};
/** Left to right as the player sees them. */
export const GRAVITY_OPTIONS: readonly GravityDirection[] = ["south", "south-down", "down", "north-down", "north"];

export const ENTRANCE = { x: -34.6, y: 0, z: 2 } as const;

export const STATIC_BOXES: readonly Box[] = [
  { name: "floor", kind: "floor", center: [CX, -W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "ceiling", kind: "ceiling", center: [CX, ROOM.height + W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  // West wall, with a door to Gallery IV at z 1..3, y 0..3 (opens when solved).
  { name: "west-north", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, -2.5], half: [W, ROOM.height / 2, 3.5] },
  { name: "west-south", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, 4.5], half: [W, ROOM.height / 2, 1.5] },
  { name: "west-lintel", kind: "wall", center: [ROOM.xMin - W, 7.5, 2], half: [W, 4.5, 1] },
  { name: "north", kind: "wall", center: [CX, ROOM.height / 2, -ROOM.halfZ - W], half: [HX + 0.5, ROOM.height / 2, W] },
  { name: "south", kind: "wall", center: [CX, ROOM.height / 2, ROOM.halfZ + W], half: [HX + 0.5, ROOM.height / 2, W] },
  // East wall, with the doorway from the corridor at z 1..3, y 0..3.
  { name: "east-north", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, -2.5], half: [W, ROOM.height / 2, 3.5] },
  { name: "east-south", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, 4.5], half: [W, ROOM.height / 2, 1.5] },
  { name: "east-lintel", kind: "wall", center: [ROOM.xMax + W, 7.5, 2], half: [W, 4.5, 1] },
  ...CORRIDOR_2_3,
  ...CORRIDOR_3_4,
];

/** The west door, which sinks into the floor once the room is solved. */
export const DOOR: Box = { name: "door", kind: "wall", center: [ROOM.xMin - W, 1.5, 2], half: [W, 1.5, 1] };
const DOOR_DROP = 3.1;
const DOOR_OPEN_SECONDS = 1.2;
/** Resetting closes the door: a player in the doorway or beyond is moved back to this spot. */
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

/** Position on the bob's arc at `angle` degrees from straight down. */
export function arcPoint(angle: number): { x: number; y: number; z: number } {
  const a = (angle * Math.PI) / 180;
  return { x: PIVOT.x, y: PIVOT.y - ROD_LENGTH * Math.cos(a), z: PIVOT.z + ROD_LENGTH * Math.sin(a) };
}

/** The angle (degrees from straight down) a pendulum hangs at under gravity `g`. */
export function hangingAngle(g: GravityDirection): number {
  const v = GRAVITY[g];
  return (Math.atan2(v.z, -v.y) * 180) / Math.PI;
}

/** Wraps degrees into −180..180. */
function wrap(a: number): number {
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

export interface LeaningOptions {
  budget?: number;
  /** Start offset from gravity's hanging angle (degrees); jittered by the solver. */
  startOffset?: number;
}

interface LeaningExtra {
  rung: boolean;
  tornLoose: boolean;
  restSteps: number;
  solved: boolean;
  /** Largest |deviation| since its last sign change, and the latest completed half-swing's. */
  peak: number;
  amplitude: number;
  lastSign: number;
  doorProgress: number;
}

export class LeaningPendulumExhibit extends ExhibitBase {
  private readonly bobHandle: number;
  private readonly bobColliderHandle: number;
  private readonly bellHandle: number;
  private readonly jointHandle: number;
  private readonly bobMass: number;
  private readonly doorHandle: number;
  private s: LeaningExtra = { rung: false, tornLoose: false, restSteps: 0, solved: false, peak: 0, amplitude: 0, lastSign: 0, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: LeaningOptions = {}) {
    super("leaning-pendulum", R, options.budget ?? 4);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);

    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;

    const bp = arcPoint(BELL.angle);
    this.bellHandle = world.createCollider(
      R.ColliderDesc.cuboid(TARGET_HALF, TARGET_HALF, TARGET_HALF).setTranslation(bp.x, bp.y, bp.z).setSensor(true).setCollisionGroups(ROOM_GROUPS),
      statics,
    ).handle;

    const start = arcPoint(hangingAngle("north") + (options.startOffset ?? START_OFFSET));
    const bob = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(start.x, start.y, start.z).setCcdEnabled(true));
    const collider = world.createCollider(
      R.ColliderDesc.ball(BOB_RADIUS).setDensity(7.8).setRestitution(0.3).setCollisionGroups(groups(GROUP.ball, GROUP.room)),
      bob,
    );
    this.bobHandle = bob.handle;
    this.bobColliderHandle = collider.handle;
    this.bobMass = bob.mass();
    const toPivot = { x: PIVOT.x - start.x, y: PIVOT.y - start.y, z: PIVOT.z - start.z };
    this.jointHandle = world.createImpulseJoint(R.JointData.revolute(PIVOT, toPivot, { x: 1, y: 0, z: 0 }), statics, bob, true).handle;

    this.rules = [gravityRule("north", GRAVITY_OPTIONS, GRAVITY_LABELS), dampingRule()];
    this.finishSetup();
  }

  get bob(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.bobHandle);
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  /** Current angle in degrees from straight down (positive = south, +z). */
  get angle(): number {
    const p = this.bob.translation();
    return (Math.atan2(p.z - PIVOT.z, PIVOT.y - p.y) * 180) / Math.PI;
  }

  /** Where gravity says the pendulum should hang right now (degrees). */
  get hanging(): number {
    return hangingAngle(this.rule("gravity").current as GravityDirection);
  }

  /** Signed angle between the pendulum and gravity's hanging direction (degrees). */
  get deviation(): number {
    return wrap(this.angle - this.hanging);
  }

  /** How wide it is swinging about the hanging direction (degrees). */
  get amplitude(): number {
    return Math.max(this.s.amplitude, this.s.peak, Math.abs(this.deviation));
  }

  get rung(): boolean {
    return this.s.rung;
  }

  get tornLoose(): boolean {
    return this.s.tornLoose;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return this.s.tornLoose;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { bob: this.bob };
  }

  protected settleBodies(): RAPIER.RigidBody[] {
    return [this.bob];
  }

  /** Damping: an impulse along the bob's velocity, −c·m·v·dt, capped like Gallery II's. */
  protected beforeStep(): void {
    if (this.s.solved && this.s.doorProgress < 1) {
      this.s.doorProgress = Math.min(1, this.s.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
      const [x, y, z] = DOOR.center;
      const t = this.s.doorProgress;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.door.setNextKinematicTranslation({ x, y: y - DOOR_DROP * eased, z });
    }
    if (this.s.tornLoose) return;
    const c = this.rule("damping").current as number;
    if (c === 0) return;
    if (c < 0 && Math.abs(this.deviation) >= ENERGY_CAP && this.isMovingAway()) return;
    const bob = this.bob;
    const v = bob.linvel();
    const k = -c * this.bobMass * this.world.timestep;
    bob.applyImpulse({ x: k * v.x, y: k * v.y, z: k * v.z }, true);
  }

  protected afterStep(): void {
    if (this.s.tornLoose || this.s.solved) return;
    const dev = this.deviation;

    // Swing amplitude about the hanging direction: peak |deviation| between sign changes.
    const sign = Math.sign(dev);
    if (sign !== 0 && sign !== this.s.lastSign) {
      if (this.s.lastSign !== 0) this.s.amplitude = this.s.peak;
      this.s.peak = 0;
      this.s.lastSign = sign;
    }
    this.s.peak = Math.max(this.s.peak, Math.abs(dev));

    if (!this.s.rung) {
      const bell = this.world.getCollider(this.bellHandle);
      if (this.world.intersectionPair(bell, this.world.getCollider(this.bobColliderHandle))) this.s.rung = true;
    }

    if (Math.abs(dev) > TEAR_LOOSE) {
      // Torn from its hook: remove the joint and let the bob fly.
      this.s.tornLoose = true;
      this.world.removeImpulseJoint(this.world.getImpulseJoint(this.jointHandle), true);
      return;
    }

    const lawsRight = this.rule("gravity").current === "down" && (this.rule("damping").current as number) > 0;
    const atRest = this.amplitude < REST;
    this.s.restSteps = this.s.rung && lawsRight && atRest ? this.s.restSteps + 1 : 0;
    if (this.s.restSteps >= REST_STEPS) this.s.solved = true;
  }

  /** Is the bob moving further from the hanging direction? */
  private isMovingAway(): boolean {
    const p = this.bob.translation();
    const v = this.bob.linvel();
    // Tangential direction of increasing angle at the bob: (0, sin a, cos a) in (y, z).
    const a = Math.atan2(p.z - PIVOT.z, PIVOT.y - p.y);
    const angular = v.y * Math.sin(a) + v.z * Math.cos(a);
    return Math.sign(angular) === Math.sign(this.deviation);
  }

  /** Gravity changes reset the amplitude tracking: the hanging direction moved. */
  setRule(id: string, value: unknown): boolean {
    const changed = super.setRule(id, value);
    if (changed && id === "gravity") {
      this.s.peak = 0;
      this.s.amplitude = 0;
      this.s.lastSign = 0;
    }
    return changed;
  }

  protected saveExtra(): LeaningExtra {
    return this.s;
  }

  protected loadExtra(extra: LeaningExtra): void {
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
        ? `Damping should be a light drag (+${nominal}/s). Here it is negative (${current}/s): every swing gains energy.`
        : current === 0
          ? `Damping should be a light drag (+${nominal}/s). Here there is none: the swing keeps its energy.`
          : `Damping should be a light drag (+${nominal}/s). Here it is ${current}/s.`,
    apply() {},
  };
}
