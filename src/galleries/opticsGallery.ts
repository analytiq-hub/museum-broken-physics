// Gallery IV, the Hidden Door, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { HANDOVER_X_34 } from "../exhibits/layout";
import { DOORWAY_X, ENTRANCE, INDEX_MARKS, MIRRORS, OpticsExhibit, RESET_SPOT } from "../exhibits/optics/sim";
import { CAMERA_POSES, buildOpticsView } from "../exhibits/optics/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createOpticsGallery(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new OpticsExhibit(R);
  const sync = new BodySync();
  const view = buildOpticsView(group, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // Mirrors are click targets: each click turns one a notch (free; they're controls, not laws).
  const ids = Object.keys(MIRRORS) as (keyof typeof MIRRORS)[];
  // The whole mirror counts (glass, frame and stand), so it's easy to hit with a finger.
  view.mirrors.forEach((parts, i) => {
    const interact = { rule: ids[i], value: ids[i], label: `Turn ${MIRRORS[ids[i]].label}`, cycle: true } satisfies Interactable;
    for (const part of parts) part.userData.interact = interact;
  });

  let wasLit = false;
  let wasRevealed = false;
  let wasSolved = false;

  return {
    id: "optics",
    title: "The Hidden Door",
    group,
    xRange: [-65.5, -53],
    exhibit,
    sync,
    recorder,
    owns: (x, margin) => x < HANDOVER_X_34 + margin,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.mirrors.flat(),
    setHovered() {},
    summary() {
      const index = exhibit.rule("index").current;
      const label = INDEX_MARKS.find((mk) => mk.value === index)?.label ?? String(index);
      return `Prism: <b>${label.toLowerCase()}</b> · photocell ${exhibit.lit ? "<b>lit</b>" : "dark"}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The hidden door has opened.";
      if (exhibit.lit) return "The photocell is lit…";
      if (exhibit.revealed) return "The bent light has revealed a hidden door. Bring the beam to its brass eye. Click a mirror to turn it.";
      return "Bring the light to the brass eye. Click a mirror to turn it; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      if (exhibit.revealed && !wasRevealed) sound.bell(1046.5);
      if (exhibit.lit && !wasLit) sound.click();
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      wasRevealed = exhibit.revealed;
      wasLit = exhibit.lit;
      wasSolved = exhibit.isSolved();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the hidden door is about to close
    },
    afterReset() {
      // A room restored from saved progress is already solved: no chime.
      wasSolved = exhibit.isSolved();
      wasLit = exhibit.lit;
      wasRevealed = exhibit.revealed;
    },
    silence() {},
  };
}
