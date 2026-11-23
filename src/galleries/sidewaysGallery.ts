// Gallery I, the Sideways Gallery, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { HANDOVER_X } from "../exhibits/layout";
import {
  DOORWAY_X,
  GRAVITY_LABELS,
  PLAYER_SPAWN,
  RESET_SPOT,
  SidewaysGravityExhibit,
} from "../exhibits/sideways-gravity/sim";
import { CAMERA_POSES, buildSidewaysGravityView } from "../exhibits/sideways-gravity/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { GravityDirection } from "../rules/Rule";
import type { Gallery, Interactable } from "./gallery";

/** A jump in the ball's velocity bigger than this (m/s) in one step is an impact. */
const IMPACT_THRESHOLD = 1.2;

export function createSidewaysGallery(
  R: typeof RAPIER,
  scene: THREE.Scene,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const exhibit = new SidewaysGravityExhibit(R);
  const sync = new BodySync();
  const view = buildSidewaysGravityView(scene, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // Console buttons become generic click targets.
  for (const button of view.buttons) {
    const value = button.userData.gravity as GravityDirection;
    button.userData.interact = { rule: "gravity", value, label: GRAVITY_LABELS[value] } satisfies Interactable;
  }

  let pendingImpact = 0;
  let lastVelocity = { x: 0, y: 0, z: 0 };
  let wasSolved = false;
  let wasFailed = false;

  return {
    id: "sideways-gravity",
    title: "The Sideways Gallery",
    exhibit,
    sync,
    recorder,
    owns: (x, margin) => x > HANDOVER_X - margin,
    entrance: PLAYER_SPAWN,
    entranceYaw: 0,
    cameraPoses: CAMERA_POSES,
    interactables: view.buttons,
    setHovered(target) {
      view.setHovered(target?.rule === "gravity" ? (target.value as GravityDirection) : undefined);
    },
    summary() {
      const gravity = exhibit.rule("gravity").current as GravityDirection;
      return `Gravity: <b>${GRAVITY_LABELS[gravity].toLowerCase()}</b>`;
    },
    status(player) {
      if (exhibit.isSolved() && player.position.x < DOORWAY_X) return "The corridor leads on to Gallery II.";
      if (exhibit.isSolved()) return "Solved! The door on the left wall is open.";
      if (exhibit.isFailed()) return "The marble fell to the floor and can't climb back up. Resetting…";
      if (exhibit.changesLeft === 0) return "Out of gravity changes. Press R to try again.";
      return "Get the marble onto the brass plate. The gravity console is just inside the doorway.";
    },
    afterStep() {
      const v = exhibit.ball.linvel();
      const jump = Math.hypot(v.x - lastVelocity.x, v.y - lastVelocity.y, v.z - lastVelocity.z);
      if (jump > IMPACT_THRESHOLD) pendingImpact = Math.max(pendingImpact, jump);
      lastVelocity = { x: v.x, y: v.y, z: v.z };
    },
    update(dt) {
      view.update(dt);
      if (pendingImpact > 0) {
        sound.impact(Math.min(1, (pendingImpact - IMPACT_THRESHOLD) / 6));
        pendingImpact = 0;
      }
      const v = exhibit.ball.linvel();
      sound.setRolling(exhibit.ballTouching() ? Math.min(1, Math.hypot(v.x, v.y, v.z) / 4) : 0);
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
      lastVelocity = { x: 0, y: 0, z: 0 };
      pendingImpact = 0;
      sound.setRolling(0);
    },
    silence() {
      sound.setRolling(0);
    },
  };
}
