// Shared museum geometry. Sim only: no three.js, no DOM.
//
// Every gallery has its own physics world. The corridor between two galleries
// exists in both worlds, and the player is handed from one world to the other
// at the corridor's midpoint (see HANDOVER_X).
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../engine/groups";

export interface Box {
  name: string;
  kind: "floor" | "ceiling" | "wall" | "glass" | "ledge" | "pedestal";
  center: [number, number, number];
  half: [number, number, number];
}

const W = 0.25; // half wall thickness

/**
 * Corridor from Gallery I's west door (x = −6.5) to Gallery II's east doorway
 * (x = −15): z 1..3, 3 m high.
 */
export const CORRIDOR_1_2: readonly Box[] = [
  { name: "corridor-floor", kind: "floor", center: [-10.75, -W, 2], half: [4.25, W, 1.5] },
  { name: "corridor-ceiling", kind: "ceiling", center: [-10.75, 3 + W, 2], half: [4.25, W, 1.5] },
  { name: "corridor-north", kind: "wall", center: [-10.75, 1.5, 1 - W], half: [4.25, 1.5, W] },
  { name: "corridor-south", kind: "wall", center: [-10.75, 1.5, 3 + W], half: [4.25, 1.5, W] },
];

/**
 * Corridor from Gallery II's west door (x = −25.5) to Gallery III's east doorway
 * (x = −34): z 1..3, 3 m high.
 */
export const CORRIDOR_2_3: readonly Box[] = [
  { name: "corridor23-floor", kind: "floor", center: [-29.75, -W, 2], half: [4.25, W, 1.5] },
  { name: "corridor23-ceiling", kind: "ceiling", center: [-29.75, 3 + W, 2], half: [4.25, W, 1.5] },
  { name: "corridor23-north", kind: "wall", center: [-29.75, 1.5, 1 - W], half: [4.25, 1.5, W] },
  { name: "corridor23-south", kind: "wall", center: [-29.75, 1.5, 3 + W], half: [4.25, 1.5, W] },
];

/** Corridor from Gallery III's west door (x = −44.5) to Gallery IV (x = −53). */
export const CORRIDOR_3_4: readonly Box[] = [
  { name: "corridor34-floor", kind: "floor", center: [-48.75, -W, 2], half: [4.25, W, 1.5] },
  { name: "corridor34-ceiling", kind: "ceiling", center: [-48.75, 3 + W, 2], half: [4.25, W, 1.5] },
  { name: "corridor34-north", kind: "wall", center: [-48.75, 1.5, 1 - W], half: [4.25, 1.5, W] },
  { name: "corridor34-south", kind: "wall", center: [-48.75, 1.5, 3 + W], half: [4.25, 1.5, W] },
];

/**
 * Corridor from Gallery IV's hidden door (x = −63) to Gallery V's east doorway
 * (x = −72): z 1..2.6, 2.4 m high, the size of the hidden door.
 */
export const CORRIDOR_4_5: readonly Box[] = [
  { name: "corridor45-floor", kind: "floor", center: [-67.5, -W, 1.8], half: [4.5, W, 0.8] },
  { name: "corridor45-ceiling", kind: "ceiling", center: [-67.5, 2.4 + W, 1.8], half: [4.5, W, 0.8] },
  { name: "corridor45-north", kind: "wall", center: [-67.5, 1.2, 1 - W], half: [4.5, 1.2, W] },
  { name: "corridor45-south", kind: "wall", center: [-67.5, 1.2, 2.6 + W], half: [4.5, 1.2, W] },
];

/** West of this x the player belongs to Gallery II's world, east of it to Gallery I's. */
export const HANDOVER_X = -10.75;
/** West of this x the player belongs to Gallery III's world. */
export const HANDOVER_X_23 = -29.75;
/** West of this x the player belongs to Gallery IV's world. */
export const HANDOVER_X_34 = -48.75;
/** West of this x the player belongs to Gallery V's world. */
export const HANDOVER_X_45 = -67.5;
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
