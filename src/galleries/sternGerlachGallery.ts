// Gallery XI, Stern–Gerlach, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, RESET_SPOT, ROOM, SPIN_MARKS, SternGerlachExhibit } from "../exhibits/stern-gerlach/sim";
import { CAMERA_POSES, buildSternGerlachView } from "../exhibits/stern-gerlach/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createSternGerlachGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new SternGerlachExhibit(R);
  const view = buildSternGerlachView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The oven's wheel lights it and puts it out (free: a control, not a law).
  const interact = { rule: "oven", value: "oven", label: "Turn the oven's wheel", cycle: true } satisfies Interactable;
  for (const part of view.oven) part.userData.interact = interact;

  let wasSolved = false;
  let wasFailed = false;

  return {
    id: "stern-gerlach",
    title: "Stern–Gerlach",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.oven,
    setHovered() {},
    summary() {
      const label = SPIN_MARKS.find((mk) => mk.value === exhibit.spin)!.label.toLowerCase();
      return `Spin: <b>${label}</b> · oven ${exhibit.ovenOn ? "hot" : "cold"}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! Two clean spots, and the door has opened.";
      if (exhibit.isFailed()) return "The glass cell between the detectors has cracked. The room will reset.";
      if (exhibit.heat > 0.5) return "The glass cell between the detectors is getting hot!";
      if (exhibit.lockProgress > 0) return "Both detectors are filling…";
      return "Fill both detectors with silver. Turn the oven's wheel to light it; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      sound.setRumble(exhibit.ovenOn && !exhibit.isFailed() && !exhibit.isSolved() ? 0.12 : 0);
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      if (exhibit.isFailed() && !wasFailed) {
        sound.shatter();
        sound.failed();
      }
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
    },
    afterReset() {
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    silence() {
      sound.setRumble(0);
    },
  };
}
