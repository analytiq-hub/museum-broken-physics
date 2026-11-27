// The Grand Stair, between Floor 1 and Floor 2, as the game runs it: a passage, not a puzzle.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { ENTRANCE, ROOM, StairwellExhibit } from "../exhibits/stairwell/sim";
import { CAMERA_POSES, FLOOR_1_TO_2, FLOOR_2_TO_3, buildStairwellView, type StairPlacards } from "../exhibits/stairwell/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery } from "./gallery";

/** The stairs from Floor 1 to Floor 2. */
export function createStairwellGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  return stairwell("stairwell", "The Grand Stair", FLOOR_1_TO_2, "Climb the stairs to Floor 2: Waves and Light.", "Floor 1 complete", CAMERA_POSES)(R, scene, materials, sound, getPlayer);
}

/** The stairs from Floor 2 to Floor 3. */
export function createUpperStairGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const poses = { "upper-stair": CAMERA_POSES.stairwell };
  return stairwell("upper-stair", "The Upper Stair", FLOOR_2_TO_3, "Climb the stairs to Floor 3: Modern Physics.", "Floor 2 complete", poses)(R, scene, materials, sound, getPlayer);
}

function stairwell(id: string, title: string, text: StairPlacards, status: string, summary: string, poses: Gallery["cameraPoses"]) {
  return (R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, _sound: Sound, getPlayer: () => Player): Gallery => buildStair(R, scene, materials, getPlayer, { id, title, text, status, summary, poses });
}

function buildStair(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  getPlayer: () => Player,
  o: { id: string; title: string; text: StairPlacards; status: string; summary: string; poses: Gallery["cameraPoses"] },
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new StairwellExhibit(R, o.id);
  const view = buildStairwellView(group, materials, o.text);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  return {
    id: o.id,
    title: o.title,
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: o.poses,
    interactables: [],
    setHovered() {},
    summary: () => o.summary,
    status: () => o.status,
    afterStep() {},
    update(dt) {
      view.update(dt);
    },
    shake: () => 0,
    beforeReset() {},
    afterReset() {},
    silence() {},
  };
}
