// Gallery VII, the Chladni Plates, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { ChladniExhibit, DOORWAY_X, ENTRANCE, RESET_SPOT, ROOM, SPEED_MARKS } from "../exhibits/chladni/sim";
import { CAMERA_POSES, buildChladniView } from "../exhibits/chladni/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

const ORDINALS = ["first", "second", "third", "fourth", "fifth"];

export function createChladniGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new ChladniExhibit(R);
  const view = buildChladniView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // Each key sounds its note until it's pressed again (free: keys are controls, not laws).
  view.keys.forEach((key, i) => {
    key.userData.interact = {
      rule: "note",
      value: `${i}`,
      label: `Press the ${ORDINALS[i]} key`,
      doneLabel: `Click: release the ${ORDINALS[i]} key`,
      offValue: "none",
    } satisfies Interactable;
  });

  let wasCracked = false;
  let wasSolved = false;
  let wasFailed = false;
  const syncFlags = () => {
    wasCracked = exhibit.cracked;
    wasSolved = exhibit.isSolved();
    wasFailed = exhibit.isFailed();
  };
  const speedLabel = () => {
    const v = exhibit.rule("brass-speed").current as number;
    return SPEED_MARKS.find((mk) => mk.value === v)?.label ?? `${v} m/s`;
  };
  const silenceAll = () => {
    sound.setPipe(null);
    sound.setGlass("plate", 440, 0);
  };

  return {
    id: "chladni",
    title: "The Chladni Plates",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.keys,
    setHovered() {},
    summary() {
      const k = exhibit.sounding;
      return `Brass: <b>${speedLabel().toLowerCase()}</b> · ${k === null ? "the plate is still" : `key ${k + 1} sounding`}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The sand drew the lock's figure, and the door has opened.";
      if (exhibit.isFailed()) return "The plate has cracked through. The room will reset.";
      if (exhibit.cracked) return "The plate has cracked! Let it rest before it breaks.";
      if (exhibit.lockProgress > 0) return "The lock is listening…";
      return "Make the sand draw the figure on the lock. Click a key to sound it; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      const tone = exhibit.isSolved() || exhibit.isFailed() ? null : exhibit.tone;
      sound.setPipe(tone === null ? null : tone / 4); // two octaves down: a hum, not a whistle
      sound.setGlass("plate", tone ?? 440, exhibit.isFailed() ? 0 : Math.min(1, exhibit.strain));
      if (exhibit.cracked && !wasCracked && !exhibit.isFailed()) sound.click();
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      if (exhibit.isFailed() && !wasFailed) {
        sound.shatter();
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
      silenceAll();
    },
  };
}
