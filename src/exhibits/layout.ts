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
