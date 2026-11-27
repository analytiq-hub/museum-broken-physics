// Gallery XIV: Galileo's Ledge. Sim only: no three.js, no DOM.
//
// A high ledge with two balls side by side in their own lanes: one brass, one
// cork, of exactly the same mass (the cork one is large and loaded to match, as far
// as the puzzle goes: they resist a push equally). A spring kicker behind them,
// when fired, sends both off the edge at the same speed. Below and beyond the
// ledge stands a balance with one pan in each lane, the cork pan farther out. The
// door opens when each ball lies in its own pan and the balance hangs level.
//
// The broken law is the equality of inertial and gravitational mass: here gravity
// pulls cork half as hard as it pulls brass, though both resist a push equally, so
// cork falls at half the rate. Kicked off the ledge, the cork ball stays up longer
// and flies farther: into the far pan. But in the pans the balance cannot hang
// level: the cork ball weighs half as much. Put the law right first and both balls
// fall alike, so the cork one lands short of its pan, on the floor (fail). The
// decoy, cork pulled harder than brass, lands it shorter still.
// The order matters: kick under the broken law, then put it right.
import type RAPIER from "@dimforge/rapier3d-compat";
import { BALL_GROUPS, ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
export const BALL_RADIUS = 0.07;
/** The ledge: a tall stone block, its top at `top`, its west edge at `edge`. */
export const LEDGE = { top: 1.8, edge: -4.0, east: -2.6, z: -1.7, halfZ: 0.5 } as const;
/** Each ball's lane (z) and where it waits on the ledge (x). */
export const LANES = { brass: -2.0, cork: -1.4 } as const;
export const START_X = -3.8;
/** How fast the kicker sends both balls west (m/s). */
export const KICK_SPEED = 3;
/** The balance's pans: inner half-width, floor top, wall height; centres where each ball lands under the broken law. */
export const PAN = { half: 0.2, floor: 0.5, wall: 0.16, wallHalf: 0.04 } as const;
export const PANS = { brass: { x: -5.62, z: LANES.brass }, cork: { x: -6.25, z: LANES.cork } } as const;

export type Fall = "same" | "half" | "more";
export const FALL_MARKS: { value: Fall; label: string }[] = [
  { value: "same", label: "As hard as brass" },
  { value: "half", label: "Half as hard" },
  { value: "more", label: "1.6 times as hard" },
];
/** Gravitational over inertial mass for cork, per setting (brass is always 1). */
export const CORK_SCALE: Record<Fall, number> = { same: 1, half: 0.5, more: 1.6 };

/** Resting in its pan with the balance level for this many steps (1 s) opens the door. */
const LOCK_STEPS = 60;
const REST_SPEED = 0.05;
const LOST_Y = 0.3;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
export const LEDGE_BOX: Box = {
  name: "ledge",
  kind: "pedestal",
  center: [(LEDGE.edge + LEDGE.east) / 2, LEDGE.top / 2, LEDGE.z],
  half: [(LEDGE.east - LEDGE.edge) / 2, LEDGE.top / 2, LEDGE.halfZ],
};

/** A pan's boxes: a floor and four low walls, centred at (x, z). */
export function panBoxes(name: string, x: number, z: number): Box[] {
  const { half, floor, wall, wallHalf } = PAN;
  const wy = floor + wall / 2;
  const off = half + wallHalf;
  const span = half + 2 * wallHalf;
  return [
    { name: `${name}-floor`, kind: "pedestal", center: [x, floor - 0.02, z], half: [span, 0.02, span] },
    { name: `${name}-west`, kind: "pedestal", center: [x - off, wy, z], half: [wallHalf, wall / 2, span] },
    { name: `${name}-east`, kind: "pedestal", center: [x + off, wy, z], half: [wallHalf, wall / 2, span] },
    { name: `${name}-north`, kind: "pedestal", center: [x, wy, z - off], half: [half, wall / 2, wallHalf] },
    { name: `${name}-south`, kind: "pedestal", center: [x, wy, z + off], half: [half, wall / 2, wallHalf] },
  ];
}
export const PAN_BOXES: readonly Box[] = [...panBoxes("pan-brass", PANS.brass.x, PANS.brass.z), ...panBoxes("pan-cork", PANS.cork.x, PANS.cork.z)];
export const STATIC_BOXES: readonly Box[] = roomShell(ROOM);
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

interface GalileoExtra {
  lockSteps: number;
  solved: boolean;
  doorProgress: number;
}

type Ball = "brass" | "cork";

export class GalileoExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private readonly ballHandles: Record<Ball, number>;
  private s: GalileoExtra = { lockSteps: 0, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("galileo", R, options.budget ?? 2);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);
    // The ledge's top is polished (no friction), so the kicked balls slide off cleanly.
    world.createCollider(R.ColliderDesc.cuboid(...LEDGE_BOX.half).setTranslation(...LEDGE_BOX.center).setFriction(0).setCollisionGroups(ROOM_GROUPS), statics);
    // The pans are lined with felt: the balls stop dead in them.
    for (const box of PAN_BOXES) {
      world.createCollider(R.ColliderDesc.cuboid(...box.half).setTranslation(...box.center).setFriction(1.2).setRestitution(0).setCollisionGroups(ROOM_GROUPS), statics);
    }
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    const ball = (z: number) => {
      const body = world.createRigidBody(
        R.RigidBodyDesc.dynamic()
          .setTranslation(START_X, LEDGE.top + BALL_RADIUS, z)
          .setAngularDamping(3)
          .setCcdEnabled(true),
      );
      // Equal mass (equal inertia) for both, whatever they are made of.
      world.createCollider(
        R.ColliderDesc.ball(BALL_RADIUS)
          .setMass(0.5)
          .setFriction(0)
          .setRestitution(0)
          .setFrictionCombineRule(R.CoefficientCombineRule.Max)
          .setCollisionGroups(BALL_GROUPS),
        body,
      );
      return body.handle;
    };
    this.ballHandles = { brass: ball(LANES.brass), cork: ball(LANES.cork) };
    const corkHandle = this.ballHandles.cork;
    this.rules = [fallRule(corkHandle), gravityRule("down", ["down"], { down: "Floor" }, false), kickerRule(this.ballHandles)];
    this.cork.setGravityScale(CORK_SCALE.half, false);
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get brass(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.ballHandles.brass);
  }

  get cork(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.ballHandles.cork);
  }

  get kicked(): boolean {
    return this.rule("kicker").current === "fired";
  }

  /** Is this ball lying still in its own pan? */
  inPan(which: Ball): boolean {
    const body = which === "brass" ? this.brass : this.cork;
    const p = body.translation();
    const pan = PANS[which];
    const v = body.linvel();
    return Math.abs(p.x - pan.x) < PAN.half && Math.abs(p.z - pan.z) < PAN.half && p.y < PAN.floor + 0.2 && Math.hypot(v.x, v.y, v.z) < REST_SPEED;
  }

  /** What each pan weighs (brass ball = 1), for the balance: 0 for an empty pan. */
  weights(): { brass: number; cork: number } {
    const scale = CORK_SCALE[this.rule("fall").current as Fall];
    return { brass: this.inPan("brass") ? 1 : 0, cork: this.inPan("cork") ? scale : 0 };
  }

  /** Has a ball fallen to the floor? */
  get lost(): boolean {
    return this.brass.translation().y < LOST_Y || this.cork.translation().y < LOST_Y;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && this.lost;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { brass: this.brass, cork: this.cork, door: this.door };
  }

  protected settleBodies(): RAPIER.RigidBody[] {
    return [this.brass, this.cork];
  }

  protected beforeStep(): void {
    if (this.s.solved && this.s.doorProgress < 1) {
      this.s.doorProgress = Math.min(1, this.s.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
      this.door.setNextKinematicTranslation({ x: DOOR.center[0], y: doorY(DOOR, this.s.doorProgress), z: DOOR.center[2] });
    }
  }

  protected afterStep(): void {
    if (this.s.solved || this.isFailed()) return;
    const w = this.weights();
    const level = w.brass > 0 && w.cork > 0 && Math.abs(w.brass - w.cork) < 1e-6;
    this.s.lockSteps = level ? this.s.lockSteps + 1 : 0;
    if (this.s.lockSteps >= LOCK_STEPS) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    this.rule("kicker").current = "fired";
    this.cork.setGravityScale(1, true);
    place(this.brass, PANS.brass);
    place(this.cork, PANS.cork);
    this.s.solved = true;
  }

  protected saveExtra(): GalileoExtra {
    return this.s;
  }

  protected loadExtra(extra: GalileoExtra): void {
    this.s = extra;
  }
}

/** Puts a ball at rest in the middle of a pan. */
function place(body: RAPIER.RigidBody, pan: { x: number; z: number }): void {
  body.setTranslation({ x: pan.x, y: PAN.floor + BALL_RADIUS, z: pan.z }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

function fallRule(corkHandle: number): Rule<Fall> {
  return {
    id: "fall",
    label: "Gravity's pull on cork",
    kind: "choice",
    options: FALL_MARKS,
    current: "half",
    nominal: "same",
    editable: true,
    observe: (current) =>
      current === "same"
        ? "Here gravity pulls cork exactly as hard as brass, kilogram for kilogram: the two fall together."
        : current === "half"
          ? "Here gravity pulls cork half as hard as brass, though a kilogram of either takes the same push to move."
          : "Here gravity pulls cork harder than brass, though a kilogram of either takes the same push to move.",
    explain: (current) =>
      current === "same"
        ? "Gravity pulls every kilogram alike, whatever it is made of, as it should: all things fall together."
        : "Gravity should pull a kilogram of cork exactly as hard as a kilogram of brass. Here it does not.",
    apply({ world }) {
      // Sleeping bodies ignore gravity changes: wake the cork as its pull changes.
      world.getRigidBody(corkHandle).setGravityScale(CORK_SCALE[this.current], true);
    },
  };
}

function kickerRule(balls: Record<Ball, number>): Rule<string> {
  return {
    id: "kicker",
    label: "Kicker",
    kind: "choice",
    options: [
      { value: "set", label: "Set" },
      { value: "fired", label: "Fired" },
    ],
    current: "set",
    nominal: "set",
    editable: true,
    control: true,
    apply({ world }) {
      if (this.current !== "fired") return;
      for (const handle of Object.values(balls)) world.getRigidBody(handle).setLinvel({ x: -KICK_SPEED, y: 0, z: 0 }, true);
    },
  };
}
