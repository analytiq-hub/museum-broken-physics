// Gallery XIII, Slow Light, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, RESET_SPOT, ROOM, SlowLightExhibit, SPEED_MARKS, type LightSpeed } from "../exhibits/slow-light/sim";
import { CAMERA_POSES, buildSlowLightView } from "../exhibits/slow-light/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createSlowLightGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new SlowLightExhibit(R);
  const view = buildSlowLightView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // Each click fires the flash lamp (free: a control). It ignores clicks while recharging.
  const lamp = { rule: "lamp", value: "lamp", label: "Fire the flash lamp", cycle: true } satisfies Interactable;
  for (const part of view.lamp) part.userData.interact = lamp;

  let wasOpen = false;
  let shownReading = "";
  let wasSolved = false;
  let wasFailed = false;

  return {
    id: "slow-light",
    title: "Slow Light",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.lamp,
    setHovered() {},
    summary() {
      const speed = exhibit.rule("light").current as LightSpeed;
      const label = SPEED_MARKS.find((mk) => mk.value === speed)?.label ?? speed;
      return `Light travels at <b>${label}</b> · shutter ${exhibit.shutterIsOpen ? "open" : "shut"} · scorch marks ${exhibit.scorches}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! One flash lit both cells at once, and the door has opened.";
      if (exhibit.isFailed()) return "The shutter is scorched through and jammed. The room will reset.";
      const reading = exhibit.reading;
      if (reading.kind === "apart") return `Cell B lit ${reading.seconds.toFixed(2)} s after cell A. The lock wants them together.`;
      if (reading.kind === "scorched") return "The flash reached the shutter while it was shut, and scorched it.";
      if (exhibit.pulses.length > 0) return "The flash is crossing the room…";
      return "Light both cells with one flash. Fire the lamp; watch the shutter's dial. Hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      // A small bell as the shutter opens; a click when the lock reads a flash.
      const open = exhibit.shutterIsOpen;
      if (open && !wasOpen && !exhibit.isSolved()) sound.bell(1320);
      wasOpen = open;
      const reading = JSON.stringify(exhibit.reading);
      if (reading !== shownReading && exhibit.reading.kind !== "none") sound.click();
      shownReading = reading;
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      if (exhibit.isFailed() && !wasFailed) sound.failed();
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
    },
    afterReset() {
      wasOpen = exhibit.shutterIsOpen;
      shownReading = JSON.stringify(exhibit.reading);
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    silence() {},
  };
}
