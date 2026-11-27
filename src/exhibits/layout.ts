// Shared museum geometry. Sim only: no three.js, no DOM.
//
// Every gallery has its own physics world. The corridor between two galleries
// exists in both worlds, and the player is handed from one world to the other
// at the corridor's midpoint (src/galleries/rooms.ts places the rooms).
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../engine/groups";

export interface Box {
  name: string;
  kind: "floor" | "ceiling" | "wall" | "glass" | "ledge" | "pedestal";
  center: [number, number, number];
  half: [number, number, number];
}

const W = 0.25; // half wall thickness

/** Every corridor: 8 m long between two walls' outer faces, z 1..3, 3 m high. */
export const CORRIDOR = { length: 8, z0: 1, z1: 3, height: 3 } as const;

/**
 * A room's corridor stub, in the room's own coordinates: on its east side running
 * east from the east wall's outer face, or on its west side running west from the
 * west wall's outer face, with its floor at `y`. Neighbouring rooms are placed
 * (src/galleries/rooms.ts) so that one's west corridor and the next one's east
 * corridor are the same corridor: it exists in both physics worlds, and the
 * player is handed over at its midpoint. Only the eastern room draws it, so views
 * skip boxes named "corridor-east-". Stopping at outer faces keeps the corridor's
 * end caps out of the plane of any visible wall (they would z-fight).
 */
export function corridor(side: "east" | "west", outerX: number, y = 0): Box[] {
  const { length, z0, z1, height } = CORRIDOR;
  const cx = side === "east" ? outerX + length / 2 : outerX - length / 2;
  const cz = (z0 + z1) / 2;
  const hz = (z1 - z0) / 2;
  const name = `corridor-${side}`;
  return [
    { name: `${name}-floor`, kind: "floor", center: [cx, y - W, cz], half: [length / 2, W, hz + 0.5] },
    { name: `${name}-ceiling`, kind: "ceiling", center: [cx, y + height + W, cz], half: [length / 2, W, hz + 0.5] },
    { name: `${name}-north`, kind: "wall", center: [cx, y + height / 2, z0 - W], half: [length / 2, height / 2, W] },
    { name: `${name}-south`, kind: "wall", center: [cx, y + height / 2, z1 + W], half: [length / 2, height / 2, W] },
  ];
}

/** Hysteresis, so standing on the line doesn't flip worlds every step. */
export const HANDOVER_MARGIN = 0.3;

/** Creates fixed colliders for `boxes` on `body`. */
export function addStaticBoxes(R: typeof RAPIER, world: RAPIER.World, body: RAPIER.RigidBody, boxes: readonly Box[]): void {
  for (const box of boxes) {
    world.createCollider(
      R.ColliderDesc.cuboid(...box.half).setTranslation(...box.center).setFriction(0.5).setCollisionGroups(ROOM_GROUPS),
      body,
    );
  }
}

/** Interior of a room built in its own coordinates: x xMin..xMax, z −halfZ..halfZ, y 0..height. */
export interface RoomBounds {
  xMin: number;
  xMax: number;
  halfZ: number;
  height: number;
}

/**
 * Floor, ceiling and walls of a plain room, with the standard doorway (z 1..3, 3 m high) in
 * its east wall and, if `westDoor`, its west wall, plus its corridor stubs. A west doorway is
 * left open: rooms that lock it add `doorBox()` as a kinematic door.
 */
export function roomShell(r: RoomBounds, options: { eastDoor?: boolean; westDoor?: boolean } = {}): Box[] {
  const { eastDoor = true, westDoor = true } = options;
  const cx = (r.xMin + r.xMax) / 2;
  const hx = (r.xMax - r.xMin) / 2;
  const { z0, z1, height: doorHeight } = CORRIDOR;
  const endWall = (side: "east" | "west", x: number, door: boolean): Box[] =>
    door
      ? [
          { name: `${side}-north`, kind: "wall", center: [x, r.height / 2, (-r.halfZ - 2 * W + z0) / 2], half: [W, r.height / 2, (z0 + r.halfZ + 2 * W) / 2] },
          { name: `${side}-south`, kind: "wall", center: [x, r.height / 2, (z1 + r.halfZ + 2 * W) / 2], half: [W, r.height / 2, (r.halfZ + 2 * W - z1) / 2] },
          { name: `${side}-lintel`, kind: "wall", center: [x, (doorHeight + r.height) / 2, (z0 + z1) / 2], half: [W, (r.height - doorHeight) / 2, (z1 - z0) / 2] },
        ]
      : [{ name: side, kind: "wall", center: [x, r.height / 2, 0], half: [W, r.height / 2, r.halfZ + 2 * W] }];
  return [
    { name: "floor", kind: "floor", center: [cx, -W, 0], half: [hx + 2 * W, W, r.halfZ + 2 * W] },
    { name: "ceiling", kind: "ceiling", center: [cx, r.height + W, 0], half: [hx + 2 * W, W, r.halfZ + 2 * W] },
    { name: "north", kind: "wall", center: [cx, r.height / 2, -r.halfZ - W], half: [hx + 2 * W, r.height / 2, W] },
    { name: "south", kind: "wall", center: [cx, r.height / 2, r.halfZ + W], half: [hx + 2 * W, r.height / 2, W] },
    ...endWall("east", r.xMax + W, eastDoor),
    ...endWall("west", r.xMin - W, westDoor),
    ...(eastDoor ? corridor("east", r.xMax + 2 * W) : []),
    ...(westDoor ? corridor("west", r.xMin - 2 * W) : []),
  ];
}

/** The door filling a room's west doorway (a kinematic body that sinks when the room is solved). */
export function doorBox(r: RoomBounds): Box {
  const { z0, z1, height } = CORRIDOR;
  return { name: "door", kind: "wall", center: [r.xMin - W, height / 2, (z0 + z1) / 2], half: [W, height / 2, (z1 - z0) / 2] };
}

/** Moves a sinking door: `progress` 0 (closed) to 1 (sunk), eased. Returns the door's y. */
export function doorY(door: Box, progress: number, drop = CORRIDOR.height + 0.1): number {
  const eased = progress < 0.5 ? 2 * progress * progress : 1 - (-2 * progress + 2) ** 2 / 2;
  return door.center[1] - drop * eased;
}
