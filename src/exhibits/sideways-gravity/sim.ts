// Exhibit 1: the sideways-gravity gallery. Sim only: no three.js, no DOM.
//
// The room starts broken: gravity points at the east wall, and a heavy marble
// ball is pinned high against it. A stone ledge runs along the north wall at
// height 3, but stops 2 m short of the east wall; its west end is the target.
//
// Intended solution: North, then West (the ball falls along the walls while
// staying high, ending in the north-west corner above the target), then Down
// (it drops onto the target). West-then-North works too: same idea.
//
// Dead end: there is no "up", so once the ball reaches the floor it can never
// get back to the ledge. Restoring "down" straight away, or from anywhere not
// above the ledge, drops it there.
//
// Layout for walking through: a full-height viewing hall south of the window
// (where the player starts), a doorway in the middle of the glass, a control
// console just inside, and an exit corridor behind the west door. The ball only
// reaches the window high up or, once failed, on the floor, so the doorway
// can't change the puzzle, and the player (under 1.8 m) can't block the ball.
//
// Axes: +x east, +y up, +z south (the viewing window is the south wall).
import type RAPIER from "@dimforge/rapier3d-compat";
import { BALL_GROUPS, ROOM_GROUPS, TELLTALE_GROUPS } from "../../engine/groups";
import { addStaticBoxes, corridor, type Box } from "../layout";
import { gravityRule, type GravityDirection } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";

export type { Box } from "../layout";

/** Interior: x -6..6, y 0..6, z -4..4. Walls are 0.5 thick, more than the ball's radius. */
export const ROOM = { halfX: 6, height: 6, halfZ: 4, wall: 0.5 } as const;

const W = ROOM.wall / 2;

/** Door opening in the west wall: z 1..3, y 0..3. */
export const DOOR: Box = { name: "door", kind: "wall", center: [-6 - W, 1.5, 2], half: [W, 1.5, 1] };
/** How far the door sinks into the floor when the room is solved. */
export const DOOR_DROP = 3.1;
const DOOR_OPEN_SECONDS = 1.2;

export const LEDGE: Box = { name: "ledge", kind: "ledge", center: [-1, 2.8, -3.25], half: [5, 0.2, 0.75] };

/** Target zone on top of the ledge's west end. */
export const TARGET: Box = { name: "target", kind: "ledge", center: [-5.2, 3.5, -3.25], half: [0.8, 0.5, 0.75] };

/** Doorway in the middle of the window: x -1.5..1.5, y 0..2.8. */
export const DOORWAY = { halfWidth: 1.5, height: 2.8 } as const;

/** The gravity console: a pedestal just inside the doorway, facing the viewing hall. */
export const CONSOLE: Box = { name: "console", kind: "pedestal", center: [0, 0.55, 2.6], half: [0.45, 0.55, 0.3] };

/** Where the player starts: in the viewing hall, facing the window. */
export const PLAYER_SPAWN = { x: 0, y: 0, z: 7.6 } as const;
/** Past this x (in the exit corridor) the player has left the gallery. */
export const EXIT_X = -9.5;
/**
 * Resetting closes the door. A player in the doorway or beyond would be shut
 * out (or inside the door), so they are moved back to this spot inside the gallery.
 */
export const DOORWAY_X = -ROOM.halfX + 0.4;
export const RESET_SPOT = { x: -4.8, y: 0, z: 2 } as const;

export const STATIC_BOXES: readonly Box[] = [
  // The gallery.
  { name: "floor", kind: "floor", center: [0, -W, 0], half: [6.5, W, 4.5] },
  { name: "ceiling", kind: "ceiling", center: [0, 6 + W, 0], half: [6.5, W, 4.5] },
  { name: "east", kind: "wall", center: [6 + W, 3, 0], half: [W, 3, 4.5] },
  { name: "north", kind: "wall", center: [0, 3, -4 - W], half: [6.5, 3, W] },
  { name: "west-north", kind: "wall", center: [-6 - W, 3, -1.75], half: [W, 3, 2.75] },
  { name: "west-south", kind: "wall", center: [-6 - W, 3, 3.75], half: [W, 3, 0.75] },
  { name: "lintel", kind: "wall", center: [-6 - W, 4.5, 2], half: [W, 1.5, 1] },
  LEDGE,
  CONSOLE,
  // The window, with a doorway in the middle.
  { name: "window-west", kind: "glass", center: [-4, 3, 4 + W], half: [2.5 + W, 3, W] },
  { name: "window-east", kind: "glass", center: [4, 3, 4 + W], half: [2.5 + W, 3, W] },
  { name: "window-top", kind: "glass", center: [0, 4.4, 4 + W], half: [1.5, 1.6, W] },
  // Viewing hall: full height, so the view through the glass isn't cut off.
  { name: "hall-floor", kind: "floor", center: [0, -W, 6.5], half: [6.5, W, 2] },
  { name: "hall-ceiling", kind: "ceiling", center: [0, 6 + W, 6.5], half: [6.5, W, 2] },
  { name: "hall-east", kind: "wall", center: [6 + W, 3, 6.5], half: [W, 3, 2] },
  { name: "hall-west", kind: "wall", center: [-6 - W, 3, 6.5], half: [W, 3, 2] },
  { name: "hall-south", kind: "wall", center: [0, 3, 8.5 + W], half: [6.5, 3, W] },
  // The corridor to Gallery II behind the west door (shared with that gallery's world).
  ...corridor("west", -6.5),
];

export const BALL_RADIUS = 0.4;
const BALL_ANGULAR_DAMPING = 2;
export const BALL_START = { x: 6 - BALL_RADIUS - 0.01, y: 4.6, z: 0 } as const;

export const GRAVITY_OPTIONS: readonly GravityDirection[] = ["down", "east", "west", "north", "south"];
/** Named from the viewer's side of the window: east is on the right, north at the back. */
export const GRAVITY_LABELS: Record<GravityDirection, string> = {
  down: "Floor",
  east: "Right wall",
  west: "Left wall",
  north: "Back wall",
  south: "Window",
  "north-down": "Floor, leaning back",
  "south-down": "Floor, leaning to the window",
};

// --- Gravity tell-tales -------------------------------------------------------
// Decorative bodies that show which way gravity points. Their collision groups
// (src/engine/groups.ts) keep them from ever touching the ball or the player.

/** Plumb line: a brass bob on a rigid 1.6 m line from a bracket below the ceiling (a bob hanging sideways must clear it). */
export const PLUMB_PIVOT = { x: 2.5, y: ROOM.height - 0.5, z: 1 } as const;
export const PLUMB_LENGTH = 1.6;
export const PLUMB_BOB_RADIUS = 0.12;

/** Loose debris, pinned to the east wall like the ball: [half-size, y, z]. */
export const DEBRIS: readonly [number, number, number][] = [
  [0.12, 1.2, -2.6],
  [0.08, 2.3, 2.2],
  [0.15, 3.4, -1.1],
  [0.1, 5.1, 1.4],
  [0.09, 0.6, 0.8],
  [0.13, 4.2, 3.1],
];

export interface SidewaysGravityOptions {
  /** Gravity changes allowed. */
  budget?: number;
  /** Shift of the ball's start position along the east wall (solver robustness jitter). */
  ballOffset?: { y: number; z: number };
}

/** Ball must stay in the target below this speed... */
const SOLVE_SPEED = 0.2;
/** ...for this many steps (0.5 s) to count as solved. */
const SOLVE_STEPS = 30;
/** Below the ledge top: the ball can never climb back up. */
const FAIL_HEIGHT = 2.5;

export class SidewaysGravityExhibit extends ExhibitBase {
  private readonly ballHandle: number;
  private readonly ballColliderHandle: number;
  private readonly targetColliderHandle: number;
  private readonly doorHandle: number;
  private readonly bobHandle: number;
  private readonly debrisHandles: number[] = [];
  private stepsInTarget = 0;
  private solved = false;
  private doorProgress = 0;

  constructor(R: typeof RAPIER, options: SidewaysGravityOptions = {}) {
    super("sideways-gravity", R, options.budget ?? 4);
    const world = this.world;

    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);

    const target = world.createCollider(
      R.ColliderDesc.cuboid(...TARGET.half).setTranslation(...TARGET.center).setSensor(true),
      statics,
    );
    this.targetColliderHandle = target.handle;

    const door = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center),
    );
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;

    const offset = options.ballOffset ?? { y: 0, z: 0 };
    const ball = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(BALL_START.x, BALL_START.y + offset.y, BALL_START.z + offset.z)
        .setCcdEnabled(true)
        // Rolling resistance: Rapier has no rolling friction, and without this the
        // ball rolls metres along whichever wall is "down" on leftover spin, which
        // makes early moves a lottery (the solver found such a lucky solution).
        .setAngularDamping(BALL_ANGULAR_DAMPING),
    );
    const ballCollider = world.createCollider(
      R.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(2.7)
        .setRestitution(0.1)
        .setFriction(0.6)
        .setCollisionGroups(BALL_GROUPS),
      ball,
    );
    this.ballHandle = ball.handle;
    this.ballColliderHandle = ballCollider.handle;

    // Plumb bob, already hanging toward the east wall.
    const bob = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(PLUMB_PIVOT.x + PLUMB_LENGTH, PLUMB_PIVOT.y, PLUMB_PIVOT.z)
        .setLinearDamping(0.4)
        .setAngularDamping(0.8),
    );
    world.createCollider(
      R.ColliderDesc.ball(PLUMB_BOB_RADIUS).setDensity(8).setCollisionGroups(TELLTALE_GROUPS),
      bob,
    );
    world.createImpulseJoint(
      R.JointData.spherical(PLUMB_PIVOT, { x: -PLUMB_LENGTH, y: 0, z: 0 }),
      statics,
      bob,
      true,
    );
    this.bobHandle = bob.handle;

    for (const [half, y, z] of DEBRIS) {
      const piece = world.createRigidBody(
        R.RigidBodyDesc.dynamic().setTranslation(ROOM.halfX - half - 0.01, y, z).setAngularDamping(0.3),
      );
      world.createCollider(
        R.ColliderDesc.cuboid(half, half, half).setDensity(2).setRestitution(0.2).setCollisionGroups(TELLTALE_GROUPS),
        piece,
      );
      this.debrisHandles.push(piece.handle);
    }

    this.rules = [gravityRule("east", GRAVITY_OPTIONS, GRAVITY_LABELS)];
    this.finishSetup();
  }

  get plumbBob(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.bobHandle);
  }

  get debris(): RAPIER.RigidBody[] {
    return this.debrisHandles.map((h) => this.world.getRigidBody(h));
  }

  get ball(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.ballHandle);
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  /** Is the ball in contact with anything right now? (Read-only; for sound.) */
  ballTouching(): boolean {
    const ball = this.world.getCollider(this.ballColliderHandle);
    let touching = false;
    this.world.contactPairsWith(ball, (other) => {
      this.world.contactPair(ball, other, (manifold) => {
        if (manifold.numContacts() > 0) touching = true;
      });
    });
    return touching;
  }

  /** 0 = closed, 1 = fully open. */
  get doorOpenness(): number {
    return this.doorProgress;
  }

  isSolved(): boolean {
    return this.solved;
  }

  isFailed(): boolean {
    if (this.solved) return false;
    const p = this.ball.translation();
    const outOfBounds =
      Math.abs(p.x) > ROOM.halfX + 1 || Math.abs(p.z) > ROOM.halfZ + 1 || p.y < -1 || p.y > ROOM.height + 1;
    return outOfBounds || p.y < FAIL_HEIGHT;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { ball: this.ball, door: this.door };
  }

  protected beforeStep(): void {
    if (!this.solved || this.doorProgress >= 1) return;
    this.doorProgress = Math.min(1, this.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
    const [x, y, z] = DOOR.center;
    this.door.setNextKinematicTranslation({ x, y: y - DOOR_DROP * easeInOut(this.doorProgress), z });
  }

  protected afterStep(): void {
    if (this.solved) return;
    const inTarget = this.world.intersectionPair(
      this.world.getCollider(this.targetColliderHandle),
      this.world.getCollider(this.ballColliderHandle),
    );
    const v = this.ball.linvel();
    const slow = Math.hypot(v.x, v.y, v.z) < SOLVE_SPEED;
    this.stepsInTarget = inTarget && slow ? this.stepsInTarget + 1 : 0;
    if (this.stepsInTarget >= SOLVE_STEPS) this.solved = true;
  }

  protected arrangeSolved(): void {
    // The marble on the brass plate; the plumb bob and debris fall to the floor by themselves.
    this.ball.setTranslation({ x: TARGET.center[0], y: TARGET.center[1], z: TARGET.center[2] }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.solved = true;
  }

  /** Only the ball decides whether the room has settled; tell-tales may still sway. */
  protected settleBodies(): RAPIER.RigidBody[] {
    return [this.ball];
  }

  protected saveExtra(): SidewaysExtra {
    return { stepsInTarget: this.stepsInTarget, solved: this.solved, doorProgress: this.doorProgress };
  }

  protected loadExtra(extra: SidewaysExtra): void {
    this.stepsInTarget = extra.stepsInTarget;
    this.solved = extra.solved;
    this.doorProgress = extra.doorProgress;
  }
}

interface SidewaysExtra {
  stepsInTarget: number;
  solved: boolean;
  doorProgress: number;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
