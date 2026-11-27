// Gallery V, the Bouncing Hall, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { HANDOVER_X_45 } from "../exhibits/layout";
import { BOUNCE_MARKS, BouncingExhibit, DOORWAY_X, ENTRANCE, RESET_SPOT } from "../exhibits/bouncing/sim";
import { CAMERA_POSES, buildBouncingView } from "../exhibits/bouncing/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createBouncingGallery(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new BouncingExhibit(R);
  const sync = new BodySync();
  const view = buildBouncingView(group, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The lever: one click drops the ball (free; it's a control, not a law).
  const lever = { rule: "lever", value: "pulled", label: "Pull the lever", doneLabel: "The lever is pulled" } satisfies Interactable;
  for (const part of view.lever) part.userData.interact = lever;

  let heardBounces = 0;
  let wasDeflected = false;
  let wasSolved = false;
  let wasFailed = false;
  const bounceLabel = () => {
    const e = exhibit.rule("bounce").current as number;
    return BOUNCE_MARKS.find((mk) => mk.value === e)?.label ?? String(e);
  };

  return {
    id: "bouncing",
    title: "The Bouncing Hall",
    group,
    xRange: [-87.5, -72],
    exhibit,
    sync,
    recorder,
    owns: (x, margin) => x < HANDOVER_X_45 + margin,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.lever,
    setHovered() {},
    summary() {
      return `Bounciness: <b>${bounceLabel().toLowerCase()}</b> · Bounces ${exhibit.bounces}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The ball is at rest on the balcony, and the way on is open.";
      if (exhibit.shattered) return "The ball smashed the skylight. The room will reset.";
      if (exhibit.dead) return "The ball has lost its bounce. It can never climb again. The room will reset.";
      if (exhibit.onBalcony()) return "The ball is on the balcony! Can you make it stay there?";
      if (exhibit.launched) return "Every bounce is higher than the last…";
      return "Bring the ball to rest on the balcony. Click the lever to drop it; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      if (exhibit.bounces > heardBounces) {
        const speed = Math.hypot(...(Object.values(exhibit.ball.linvel()) as [number, number, number]));
        sound.impact(Math.min(1, speed / 9) * 0.8);
        heardBounces = exhibit.bounces;
      }
      if (exhibit.deflected && !wasDeflected) sound.bell(1318.5); // the deflector rings like a gong
      if (exhibit.shattered && !wasFailed) sound.shatter();
      else if (exhibit.isFailed() && !wasFailed) sound.failed();
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      wasDeflected = exhibit.deflected;
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the exit door is about to close
    },
    afterReset() {
      // A room restored from saved progress is already solved: no chime.
      heardBounces = exhibit.bounces;
      wasDeflected = exhibit.deflected;
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    silence() {},
  };
}
