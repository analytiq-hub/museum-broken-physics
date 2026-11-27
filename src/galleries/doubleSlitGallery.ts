// Gallery IX, Young's Double Slit (Floor 2's finale), as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, DoubleSlitExhibit, ENTRANCE, INDEX_MARKS, RESET_SPOT, ROOM, WAVELENGTH_MARKS } from "../exhibits/double-slit/sim";
import { CAMERA_POSES, buildDoubleSlitView } from "../exhibits/double-slit/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

const label = (marks: readonly { value: number; label: string }[], v: number) => marks.find((mk) => mk.value === v)?.label ?? String(v);

export function createDoubleSlitGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new DoubleSlitExhibit(R);
  const view = buildDoubleSlitView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The observer lamp switches on and off with each click (free: a control, not a law).
  const interact = { rule: "observer", value: "observer", label: "Switch the observer lamp", cycle: true } satisfies Interactable;
  for (const part of view.observer) part.userData.interact = interact;

  let wasSolved = false;

  return {
    id: "double-slit",
    title: "Young's Double Slit",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.observer,
    setHovered() {},
    summary() {
      const o = exhibit.optics;
      return `Light: <b>${label(WAVELENGTH_MARKS, o.wavelength).toLowerCase()}</b> · tank: <b>${label(INDEX_MARKS, o.index).toLowerCase()}</b>${o.observed ? " · observer on" : ""}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! A bright band lies on the sensor, and the way to Floor 3 is open.";
      if (exhibit.optics.observed) return "The observer is watching the slits, and the bands have gone.";
      if (exhibit.sensorLit) return "A bright band on the sensor…";
      return "Bring a bright band to the sensor on the screen. Hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      wasSolved = exhibit.isSolved();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
    },
    afterReset() {
      wasSolved = exhibit.isSolved();
    },
    silence() {},
  };
}
