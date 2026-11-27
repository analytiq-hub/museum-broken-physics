// Gallery VIII, the Backwards Furnace, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { AIMS, DOORWAY_X, ENTRANCE, FurnaceExhibit, RESET_SPOT, ROOM } from "../exhibits/furnace/sim";
import { CAMERA_POSES, buildFurnaceView } from "../exhibits/furnace/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createFurnaceGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new FurnaceExhibit(R);
  const view = buildFurnaceView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The mirror turns to the next aim with each click (free: it's a control, not a law).
  const interact = { rule: "mirror", value: "mirror", label: "Turn the mirror", cycle: true } satisfies Interactable;
  for (const part of view.mirror) part.userData.interact = interact;

  let wasUnlatched = false;
  let wasSolved = false;
  let wasFailed = false;
  const syncFlags = () => {
    wasUnlatched = exhibit.unlatched;
    wasSolved = exhibit.isSolved();
    wasFailed = exhibit.isFailed();
  };

  return {
    id: "furnace",
    title: "The Backwards Furnace",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.mirror,
    setHovered() {},
    summary() {
      const law = exhibit.lawBroken ? "cold → hot" : "hot → cold";
      return `Heat flows <b>${law}</b> · the beam is on ${AIMS[exhibit.aim].label}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The latch is free and the room has calmed. The door is open.";
      if (exhibit.boiled) return "The meltwater boiled and the steam burst the frame. The room will reset.";
      if (exhibit.waxMelted) return "The wax seal has melted. The room will reset.";
      if (exhibit.unlatched) return "The ice has let go of the latch… and the water is getting hotter.";
      if (exhibit.melted > 0) return "The ice is melting…";
      return "The door is latched with ice. Click the mirror to aim the beam; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      sound.setRumble(Math.min(1, Math.max(0, (exhibit.temperatures.stove - 150) / 250)) * 0.3);
      if (exhibit.unlatched && !wasUnlatched) sound.hiss();
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      if (exhibit.isFailed() && !wasFailed) {
        if (exhibit.boiled) sound.hiss();
        sound.failed();
      }
      syncFlags();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
    },
    afterReset() {
      syncFlags();
    },
    silence() {
      sound.setRumble(0);
    },
  };
}
