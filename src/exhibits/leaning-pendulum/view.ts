// View of the Leaning Pendulum gallery: the shared pendulum-room builder with
// a wall-arm mount, one bell above the pivot, and dust drifting with gravity.
import type * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { GRAVITY, type GravityDirection } from "../../rules/Rule";
import { buildPendulumRoom, type PendulumView } from "../pendulum/view";
import { BELL, BOB_RADIUS, DOOR, PIVOT, ROD_LENGTH, ROOM, STATIC_BOXES, type LeaningPendulumExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** High in the entrance corner, looking across the swing plane at the bell. */
  leaning: { position: [-34.6, 9.5, 4.8] as V3, target: [-39.5, 6.5, -2] as V3 },
  /** Low near the south wall, looking up at the pendulum and bell. */
  "leaning-low": { position: [-43.4, 1.6, 4.6] as V3, target: [-39, 6.5, -1.5] as V3 },
} as const;

export function buildLeaningPendulumView(
  scene: THREE.Object3D,
  ex: LeaningPendulumExhibit,
  sync: BodySync,
  m: Materials,
): PendulumView {
  return buildPendulumRoom(scene, sync, m, {
    room: ROOM,
    pivot: PIVOT,
    rodLength: ROD_LENGTH,
    bobRadius: BOB_RADIUS,
    boxes: STATIC_BOXES,
    skip: ["corridor23-"], // drawn by Gallery II
    mount: "west-arm",
    bells: [BELL],
    door: { box: DOOR, body: () => ex.door },
    placard: {
      kicker: "GALLERY III",
      title: "The Leaning Pendulum",
      lines: [
        "Gravity leans toward the right wall here,",
        "and every swing gains energy. Ring the bell,",
        "then put both laws right. Mind the order:",
        "a sudden drop will tear the pendulum loose.",
      ],
    },
    bob: () => ex.bob,
    rung: () => (ex.rung ? [BELL.name] : []),
    vaseBroken: () => false,
    detached: () => ex.tornLoose,
    gravity: () => {
      const g = GRAVITY[ex.rule("gravity").current as GravityDirection];
      const len = Math.hypot(g.x, g.y, g.z);
      return { x: g.x / len, y: g.y / len, z: g.z / len };
    },
  });
}
