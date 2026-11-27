// Gallery X, Rutherford's Gold Foil, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { CHARGE_MARKS, DOORWAY_X, ENTRANCE, RESET_SPOT, ROOM, RutherfordExhibit } from "../exhibits/rutherford/sim";
import { CAMERA_POSES, buildRutherfordView } from "../exhibits/rutherford/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createRutherfordGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new RutherfordExhibit(R);
  const view = buildRutherfordView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // Each click slides the source to its next position (free: a control, not a law).
  const interact = { rule: "source", value: "source", label: "Slide the source along", cycle: true } satisfies Interactable;
  for (const part of view.source) part.userData.interact = interact;

  let heardHits = 0;
  let wasSolved = false;

  return {
    id: "rutherford",
    title: "Rutherford's Gold Foil",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.source,
    setHovered() {},
    summary() {
      const label = CHARGE_MARKS.find((mk) => mk.value === exhibit.charge)!.label.toLowerCase();
      return `Charge: <b>${label}</b> · source at position ${Number(exhibit.rule("source").current) + 1} · bounced back ${exhibit.hits} of 3`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! Three particles came straight back, and the door has opened.";
      if (exhibit.hits > 0) return "A particle came straight back!";
      return "Bounce three alpha particles straight back. Click the source to slide it; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      if (exhibit.hits > heardHits) sound.bell(1568);
      heardHits = exhibit.hits;
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
      heardHits = exhibit.hits;
      wasSolved = exhibit.isSolved();
    },
    silence() {},
  };
}
