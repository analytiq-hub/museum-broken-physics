// Gallery XIV, Galileo's Ledge, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, FALL_MARKS, GalileoExhibit, RESET_SPOT, ROOM, type Fall } from "../exhibits/galileo/sim";
import { CAMERA_POSES, buildGalileoView } from "../exhibits/galileo/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createGalileoGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new GalileoExhibit(R);
  const sync = new BodySync();
  const view = buildGalileoView(group, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The lever fires the kicker (free: a control).
  const lever = { rule: "kicker", value: "fired", label: "Fire the kicker", doneLabel: "The kicker has fired" } satisfies Interactable;
  for (const part of view.lever) part.userData.interact = lever;

  let wasIn = { brass: false, cork: false };
  let wasSolved = false;
  let wasFailed = false;

  return {
    id: "galileo",
    title: "Galileo's Ledge",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync,
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.lever,
    setHovered() {},
    summary() {
      const fall = exhibit.rule("fall").current as Fall;
      const label = FALL_MARKS.find((mk) => mk.value === fall)?.label ?? fall;
      const w = exhibit.weights();
      const pans = w.brass > 0 && w.cork > 0 ? (Math.abs(w.brass - w.cork) < 1e-6 ? "level" : `cork pan weighs ${w.cork / w.brass}× brass`) : "not both full";
      return `Gravity pulls cork <b>${label.toLowerCase()}</b> · balance: ${pans}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! Each ball in its pan, the balance level, and the door has opened.";
      if (exhibit.isFailed()) return "A ball fell short of its pan, onto the floor. The room will reset.";
      const w = exhibit.weights();
      if (w.brass > 0 && w.cork > 0) return "Both balls are in their pans, but the balance won't hang level.";
      if (exhibit.kicked) return "The balls are flying…";
      return "Put each ball in its own pan, with the balance level. Pull the lever to fire the kicker; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      // A soft thud as each ball comes to rest in its pan.
      const now = { brass: exhibit.inPan("brass"), cork: exhibit.inPan("cork") };
      if ((now.brass && !wasIn.brass) || (now.cork && !wasIn.cork)) sound.impact(0.3);
      wasIn = now;
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
      wasIn = { brass: exhibit.inPan("brass"), cork: exhibit.inPan("cork") };
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    silence() {},
  };
}
