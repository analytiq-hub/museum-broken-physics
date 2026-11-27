// The Grand Stair: the passage between Floor 1 and Floor 2. Sim only: no three.js, no DOM.
//
// Nothing is broken here. A narrow, tall hall: the corridor from Floor 1's last
// gallery comes in at the bottom of its east wall, one wide flight of stairs
// climbs west to a landing, and the corridor to Floor 2 leaves the top of the west
// wall. The stairs are drawn as steps (view.ts) over one smooth ramp collider,
// which the character controller climbs (max slope 45°; this one is 31°).
//
// Its own coordinates: the east wall's outer face is x = 0; Floor 1 is y = 0.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { gravityRule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, corridor, type Box } from "../layout";

const W = 0.25;
/** How far Floor 2 is above Floor 1 (m). */
export const RISE = 4.8;
/** Interior: x −12.5..−0.5, z 0.5..3.5, y 0..9.5. */
export const ROOM = { xMin: -12.5, xMax: -0.5, z0: 0.5, z1: 3.5, height: 9.5 } as const;
/** The flight: from the floor at x = STAIR.x0 up to the landing at x = STAIR.x1. */
export const STAIR = { x0: -2, x1: -10, steps: 16 } as const;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const HX = (ROOM.xMax - ROOM.xMin) / 2;
const CZ = (ROOM.z0 + ROOM.z1) / 2;
const HZ = (ROOM.z1 - ROOM.z0) / 2;
/** Doorways (both z 1..3): the east one at the floor, the west one at the landing. */
const DOOR = { z0: 1, z1: 3, height: 3 } as const;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;

const run = STAIR.x0 - STAIR.x1;
const slope = Math.atan2(RISE, run);
const RAMP_HALF_THICKNESS = 0.5;
/** The ramp's top face runs from (x0, 0) to (x1, RISE); its centre sits half a thickness below. */
const rampCentre: [number, number, number] = [
  (STAIR.x0 + STAIR.x1) / 2 - Math.sin(slope) * RAMP_HALF_THICKNESS,
  RISE / 2 - Math.cos(slope) * RAMP_HALF_THICKNESS,
  CZ,
];
export const RAMP = { center: rampCentre, half: [Math.hypot(run, RISE) / 2, RAMP_HALF_THICKNESS, HZ] as [number, number, number], angle: -slope } as const;

/** A wall across the hall at `x`, with a doorway at floor height `doorY`. */
function endWall(name: string, x: number, doorY: number): Box[] {
  const top = doorY + DOOR.height;
  const boxes: Box[] = [
    { name: `${name}-north`, kind: "wall", center: [x, ROOM.height / 2, (ROOM.z0 - 2 * W + DOOR.z0) / 2], half: [W, ROOM.height / 2, (DOOR.z0 - ROOM.z0 + 2 * W) / 2] },
    { name: `${name}-south`, kind: "wall", center: [x, ROOM.height / 2, (DOOR.z1 + ROOM.z1 + 2 * W) / 2], half: [W, ROOM.height / 2, (ROOM.z1 + 2 * W - DOOR.z1) / 2] },
    { name: `${name}-lintel`, kind: "wall", center: [x, (top + ROOM.height) / 2, 2], half: [W, (ROOM.height - top) / 2, 1] },
  ];
  if (doorY > 0) boxes.push({ name: `${name}-below`, kind: "wall", center: [x, doorY / 2, 2], half: [W, doorY / 2, 1] });
  return boxes;
}

export const STATIC_BOXES: readonly Box[] = [
  { name: "floor", kind: "floor", center: [CX, -W, CZ], half: [HX + 2 * W, W, HZ + 2 * W] },
  { name: "ceiling", kind: "ceiling", center: [CX, ROOM.height + W, CZ], half: [HX + 2 * W, W, HZ + 2 * W] },
  { name: "north", kind: "wall", center: [CX, ROOM.height / 2, ROOM.z0 - W], half: [HX + 2 * W, ROOM.height / 2, W] },
  { name: "south", kind: "wall", center: [CX, ROOM.height / 2, ROOM.z1 + W], half: [HX + 2 * W, ROOM.height / 2, W] },
  ...endWall("east", ROOM.xMax + W, 0),
  ...endWall("west", ROOM.xMin - W, RISE),
  // The landing: solid masonry from the floor up to Floor 2.
  { name: "landing", kind: "pedestal", center: [(STAIR.x1 + ROOM.xMin) / 2, RISE / 2, CZ], half: [(STAIR.x1 - ROOM.xMin) / 2, RISE / 2, HZ] },
  ...corridor("east", ROOM.xMax + 2 * W),
  ...corridor("west", ROOM.xMin - 2 * W, RISE),
];

/** The passage between floors: no laws to change, nothing to solve. */
export class StairwellExhibit extends ExhibitBase {
  constructor(R: typeof RAPIER, id = "stairwell") {
    super(id, R, 0);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);
    world.createCollider(
      R.ColliderDesc.cuboid(...RAMP.half)
        .setTranslation(...RAMP.center)
        .setRotation({ x: 0, y: 0, z: Math.sin(RAMP.angle / 2), w: Math.cos(RAMP.angle / 2) })
        .setFriction(0.5)
        .setCollisionGroups(ROOM_GROUPS),
      statics,
    );
    this.rules = [gravityRule("down", ["down"], { down: "Floor" }, false)];
    this.finishSetup();
  }

  isSolved(): boolean {
    return false;
  }

  isFailed(): boolean {
    return false;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return {};
  }

  protected arrangeSolved(): void {}
}
