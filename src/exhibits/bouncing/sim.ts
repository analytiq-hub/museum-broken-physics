// Gallery V: the Bouncing Hall. Sim only: no three.js, no DOM.
//
// A rubber ball hangs in a brass claw over an anvil near the west wall of a
// tall hall. Pull the lever and it drops. The broken law is bounciness (the
// coefficient of restitution): it is above 1, so every bounce comes back
// faster than it went down, and the ball climbs higher with each hop.
//
// Goal: a brass balcony high on the west wall, behind a railing. Above the
// anvil, a slanted brass deflector turns any bounce that reaches it toward the
// balcony. Only the broken law gets the ball that high, but with the broken
// law it bounces straight back off the balcony. Restore the bounce once the
// ball is on its way up there, and it comes to rest on the balcony. Fail: fix
// it too early and the ball dies on the anvil; wait too long and it escapes,
// bouncing ever higher, and smashes the glass skylight.
//
// Restitution above 1 is never handed to the engine: Rapier bounces the ball
// elastically (restitution 1), and an explicit, capped boost scales the
// rebound of each upward bounce.
//
// Floor 1, Gallery III: between the Restless Pendulum and the Leaning Pendulum.
import type RAPIER from "@dimforge/rapier3d-compat";
import { groups, GROUP, ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, corridor, type Box } from "../layout";

/** Interior: x −84..−72, y 0..6, z −5..5. */
export const ROOM = { xMin: -84, xMax: -72, halfZ: 5, height: 6 } as const;
const W = 0.25;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const HX = (ROOM.xMax - ROOM.xMin) / 2;

/** The ball's lane, along the north side of the hall (the player walks in on the south side). */
export const LANE_Z = -3;
export const BALL_RADIUS = 0.18;

/** The balcony on the west wall, over the lane: a shelf at y0 with a railing at its edge. */
export const BALCONY = { y0: 3.0, depth: 2.2, thickness: 0.3, railing: 0.08, z0: LANE_Z - 0.8, z1: LANE_Z + 0.8 } as const;
export const BALCONY_EDGE = ROOM.xMin + BALCONY.depth;
/** The ball drops and bounces along this vertical line, just in front of the balcony. */
export const DROP_X = BALCONY_EDGE + 0.22;
/** The anvil the ball bounces on. */
export const ANVIL: Box = { name: "anvil", kind: "pedestal", center: [DROP_X, 0.05, LANE_Z], half: [0.3, 0.05, 0.3] };
const ANVIL_TOP = 0.1;
/** Where the claw holds the ball (centre height). */
export const DROP_HEIGHT = 1.6;
/** The slanted deflector over the anvil: a plate tilted 45°, high end to the west. */
export const DEFLECTOR = { x: DROP_X, y: 4.6, z: LANE_Z, halfLength: 0.45, halfThickness: 0.025, halfWidth: 0.4, angle: -Math.PI / 4 } as const;
/** The glass skylight: the ball reaching this high smashes it. */
export const SKYLIGHT_Y = ROOM.height - 0.5;

/** Bounciness settings the instrument offers (rebound speed ÷ impact speed). */
export const BOUNCE_MARKS = [
  { value: 1.07, label: "Gains energy (1.07)" },
  { value: 1, label: "Perfectly elastic (1.0)" },
  { value: 0.6, label: "Rubber (0.6)" },
  { value: 0.2, label: "Clay (0.2)" },
] as const;
export const BOUNCE_BROKEN = 1.07;
export const BOUNCE_LAW = 0.6;
/** The boost never sends the ball up faster than this (enough to reach the ceiling). */
const MAX_REBOUND = Math.sqrt(2 * 9.81 * ROOM.height);

/** Share of its sideways speed a ball keeps when it bounces on the balcony's felt. */
const FELT_KEEP = 0.15;
/** On the balcony and slower than this (m/s)... */
const REST_SPEED = 0.15;
/** ...for this many steps (0.5 s) counts as solved. */
const REST_STEPS = 30;
/** On the hall floor and this slow for this long (1 s) after launch: it can never climb again. */
const DEAD_STEPS = 60;
/** On the hall floor or the anvil (centre height). */
const LOW = ANVIL_TOP + BALL_RADIUS + 0.05;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;

const bx = ROOM.xMin + BALCONY.depth / 2; // balcony centre x
const bz = (BALCONY.z0 + BALCONY.z1) / 2;
const bh = (BALCONY.z1 - BALCONY.z0) / 2;
export const BALCONY_BOX: Box = { name: "balcony", kind: "ledge", center: [bx, BALCONY.y0 - BALCONY.thickness / 2, bz], half: [BALCONY.depth / 2, BALCONY.thickness / 2, bh] };
export const STATIC_BOXES: readonly Box[] = [
  { name: "floor", kind: "floor", center: [CX, -W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "ceiling", kind: "ceiling", center: [CX, ROOM.height + W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "north", kind: "wall", center: [CX, ROOM.height / 2, -ROOM.halfZ - W], half: [HX + 0.5, ROOM.height / 2, W] },
  { name: "south", kind: "wall", center: [CX, ROOM.height / 2, ROOM.halfZ + W], half: [HX + 0.5, ROOM.height / 2, W] },
  // East wall, with the doorway from the corridor at z 1..3, y 0..3.
  { name: "east-north", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, -2.25], half: [W, ROOM.height / 2, 3.25] },
  { name: "east-south", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, 4.25], half: [W, ROOM.height / 2, 1.25] },
  { name: "east-lintel", kind: "wall", center: [ROOM.xMax + W, 4.5, 2], half: [W, 1.5, 1] },
  // West wall, with the exit door (z 1..3, y 0..3).
  { name: "west-north", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, -2], half: [W, ROOM.height / 2, 3.5] },
  { name: "west-south", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, 4.25], half: [W, ROOM.height / 2, 1.25] },
  { name: "west-lintel", kind: "wall", center: [ROOM.xMin - W, 4.5, 2], half: [W, 1.5, 1] },
  // The balcony over the lane, and its railing.
  BALCONY_BOX,
  { name: "balcony-railing", kind: "ledge", center: [BALCONY_EDGE - 0.03, BALCONY.y0 + BALCONY.railing / 2, bz], half: [0.03, BALCONY.railing / 2, bh] },
  ANVIL,
  ...corridor("east", ROOM.xMax + 2 * W),
  // Beyond the exit door: the corridor to Gallery VI.
  ...corridor("west", ROOM.xMin - 2 * W),
];

/** The exit door, which sinks into the floor once the room is solved. */
export const DOOR: Box = { name: "door", kind: "wall", center: [ROOM.xMin - W, 1.5, 2], half: [W, 1.5, 1] };
const DOOR_DROP = 3.1;
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

/** The lever, south of the anvil (a control: free, operated in the world). */
export const LEVER = { x: DROP_X + 1.2, z: LANE_Z + 1.6 } as const;

export interface BouncingOptions {
  budget?: number;
  /** Drop height (m, ball centre); jittered by the solver's robustness check. */
  dropHeight?: number;
}

interface BouncingExtra {
  launched: boolean;
  /** Vertical speed after the last step, to spot a bounce (down → up). */
  lastVy: number;
  bounces: number;
  /** Step at which the ball first struck the deflector (−1 = not yet). */
  deflectedAt: number;
  restSteps: number;
  deadSteps: number;
  shattered: boolean;
  solved: boolean;
  doorProgress: number;
}

export class BouncingExhibit extends ExhibitBase {
  private readonly ballHandle: number;
  private readonly ballColliderHandle: number;
  private readonly doorHandle: number;
  private s: BouncingExtra = { launched: false, lastVy: 0, bounces: 0, deflectedAt: -1, restSteps: 0, deadSteps: 0, shattered: false, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: BouncingOptions = {}) {
    super("bouncing", R, options.budget ?? 2);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES.filter((b) => b.name !== "balcony"));
    // The balcony's floor is felt: it grips, so a ball landing there loses its
    // sideways speed and just bounces in place (higher and higher, while the law is broken).
    const [hx, hy, hz] = BALCONY_BOX.half;
    world.createCollider(
      R.ColliderDesc.cuboid(hx, hy, hz).setTranslation(...BALCONY_BOX.center).setFriction(1.5).setCollisionGroups(ROOM_GROUPS),
      statics,
    );

    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;

    // The ball touches only the room: never the player, so nobody can block a shot.
    // It takes each surface's own grip (friction 0, combined by Max) and loses spin quickly.
    // The claw: the ball floats (no gravity) until the lever drops it.
    const ball = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(DROP_X, options.dropHeight ?? DROP_HEIGHT, LANE_Z)
        .setGravityScale(0)
        .setAngularDamping(3)
        .setCcdEnabled(true),
    );
    const collider = world.createCollider(
      R.ColliderDesc.ball(BALL_RADIUS)
        .setDensity(1.1)
        .setFriction(0)
        .setFrictionCombineRule(R.CoefficientCombineRule.Max)
        .setRestitutionCombineRule(R.CoefficientCombineRule.Max)
        .setCollisionGroups(groups(GROUP.ball, GROUP.room)),
      ball,
    );
    this.ballHandle = ball.handle;
    this.ballColliderHandle = collider.handle;

    const d = DEFLECTOR;
    world.createCollider(
      R.ColliderDesc.cuboid(d.halfLength, d.halfThickness, d.halfWidth)
        .setTranslation(d.x, d.y, d.z)
        .setRotation({ x: 0, y: 0, z: Math.sin(d.angle / 2), w: Math.cos(d.angle / 2) })
        .setFriction(0) // a clean glancing blow, no spin
        .setCollisionGroups(ROOM_GROUPS),
      statics,
    );

    this.rules = [
      bounceRule(this.ballColliderHandle),
      gravityRule("down", ["down"], { down: "Floor" }, false),
      leverRule(),
    ];
    this.finishSetup();
  }

  get ball(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.ballHandle);
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get launched(): boolean {
    return this.s.launched;
  }

  get bounces(): number {
    return this.s.bounces;
  }

  /** Has the ball struck the deflector yet? (The clang the player reacts to.) */
  get deflected(): boolean {
    return this.s.deflectedAt >= 0;
  }

  get deflectedAt(): number {
    return this.s.deflectedAt;
  }

  get shattered(): boolean {
    return this.s.shattered;
  }

  /** Is the ball on the balcony (behind the railing, below head height)? */
  onBalcony(): boolean {
    const p = this.ball.translation();
    return p.x < BALCONY_EDGE && p.y > BALCONY.y0 && p.y < BALCONY.y0 + 0.8 && p.z > BALCONY.z0 && p.z < BALCONY.z1;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && (this.s.shattered || this.s.deadSteps >= DEAD_STEPS);
  }

  /** Lost its bounce on the hall floor: it will never climb again. */
  get dead(): boolean {
    return this.s.deadSteps >= DEAD_STEPS;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { ball: this.ball };
  }

  protected settleBodies(): RAPIER.RigidBody[] {
    return [this.ball];
  }

  protected beforeStep(): void {
    if (this.s.solved && this.s.doorProgress < 1) {
      this.s.doorProgress = Math.min(1, this.s.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
      const [x, y, z] = DOOR.center;
      const t = this.s.doorProgress;
      const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      this.door.setNextKinematicTranslation({ x, y: y - DOOR_DROP * eased, z });
    }
    // The lever opens the claw.
    if (!this.s.launched && this.rule("lever").current === "pulled") {
      this.s.launched = true;
      // A ball left in the claw for a while has gone to sleep, and a sleeping body
      // ignores gravity (see CLAUDE.md): wake it explicitly.
      this.ball.setGravityScale(1, true);
      this.ball.wakeUp();
    }
  }

  protected afterStep(): void {
    const ball = this.ball;
    const v = ball.linvel();
    // A bounce off something below: falling last step, rising now. Above 1, the
    // engine bounced it elastically; scale the rebound up, capped.
    const e = this.rule("bounce").current as number;
    if (this.s.lastVy < -0.5 && v.y > 0) {
      this.s.bounces++;
      // The balcony's felt soaks up sideways motion: a ball landing there bounces in place.
      const p = ball.translation();
      const onFelt = p.x < BALCONY_EDGE && Math.abs(p.y - (BALCONY.y0 + BALL_RADIUS)) < 0.15;
      const keep = onFelt ? FELT_KEEP : 1;
      ball.setLinvel({ x: v.x * keep, y: e > 1 ? Math.min(v.y * e, MAX_REBOUND) : v.y, z: v.z * keep }, true);
    }
    this.s.lastVy = ball.linvel().y;
    if (this.s.solved || this.isFailed()) return;
    // Until the deflector, the ball only moves up and down.
    if (this.s.deflectedAt < 0 && Math.abs(v.x) > 0.3) this.s.deflectedAt = this.stepCount;

    const p = ball.translation();
    if (p.y + BALL_RADIUS > SKYLIGHT_Y) this.s.shattered = true;
    const speed = Math.hypot(v.x, v.y, v.z);
    this.s.restSteps = this.onBalcony() && speed < REST_SPEED ? this.s.restSteps + 1 : 0;
    if (this.s.restSteps >= REST_STEPS) this.s.solved = true;
    const onFloor = this.s.launched && p.y < LOW && Math.abs(v.y) < 0.3;
    this.s.deadSteps = onFloor ? this.s.deadSteps + 1 : 0;
  }

  protected arrangeSolved(): void {
    const rule = this.rule("lever");
    rule.current = "pulled";
    this.s.launched = true;
    this.ball.setGravityScale(1, true);
    this.ball.setTranslation({ x: ROOM.xMin + 0.5, y: BALCONY.y0 + BALL_RADIUS + 0.02, z: LANE_Z }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.s.solved = true;
  }

  protected saveExtra(): BouncingExtra {
    return this.s;
  }

  protected loadExtra(extra: BouncingExtra): void {
    this.s = extra;
  }
}

function bounceRule(colliderHandle: number): Rule<number> {
  return {
    id: "bounce",
    label: "Bounciness",
    kind: "range",
    range: { min: 0.3, max: 1.07, step: 0.01 },
    marks: BOUNCE_MARKS,
    current: BOUNCE_BROKEN,
    nominal: BOUNCE_LAW,
    editable: true,
    observe: (current) =>
      current > 1
        ? `Here a ball comes back up at ${current}× the speed it hit the floor: every bounce is higher than the last.`
        : current === 1
          ? "Here a ball comes back up at exactly the speed it hit the floor: it bounces to the same height for ever."
          : `Here a ball comes back up at ${current}× the speed it hit the floor: each bounce is lower than the last.`,
    explain: (current, nominal) =>
      current > 1
        ? `A rubber ball should come back up at ${nominal}× the speed it hit the floor, losing a little each bounce. Here it is ${current}×: every bounce is higher than the last.`
        : current === 1
          ? `A rubber ball should come back up at ${nominal}× the speed it hit the floor. Here it is exactly 1×: it bounces to the same height for ever.`
          : `A rubber ball should come back up at ${nominal}× the speed it hit the floor. Here it is ${current}×.`,
    // The engine gets at most 1 (perfectly elastic); above that, afterStep() boosts each rebound.
    apply(ctx) {
      ctx.world.getCollider(colliderHandle).setRestitution(Math.min(1, this.current));
    },
  };
}

function leverRule(): Rule<string> {
  return {
    id: "lever",
    label: "Lever",
    kind: "choice",
    options: [
      { value: "held", label: "Held" },
      { value: "pulled", label: "Pulled" },
    ],
    current: "held",
    nominal: "held",
    editable: true,
    control: true,
    // The launch happens in beforeStep(), once, so reloading a saved state never relaunches.
    apply() {},
  };
}
