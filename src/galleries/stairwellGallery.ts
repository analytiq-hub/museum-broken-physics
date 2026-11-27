// The Grand Stair, between Floor 1 and Floor 2, as the game runs it: a passage, not a puzzle.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { ENTRANCE, ROOM, StairwellExhibit } from "../exhibits/stairwell/sim";
import { CAMERA_POSES, buildStairwellView } from "../exhibits/stairwell/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery } from "./gallery";

export function createStairwellGallery(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  _sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new StairwellExhibit(R);
  const view = buildStairwellView(group, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  return {
    id: "stairwell",
    title: "The Grand Stair",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: [],
    setHovered() {},
    summary: () => "Floor 1 complete",
    status: () => "Climb the stairs to Floor 2: Waves and Light.",
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
