// Gallery III, the Leaning Pendulum, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, GRAVITY_LABELS, LeaningPendulumExhibit, RESET_SPOT, TEAR_LOOSE } from "../exhibits/leaning-pendulum/sim";
import { CAMERA_POSES, buildLeaningPendulumView } from "../exhibits/leaning-pendulum/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { GravityDirection } from "../rules/Rule";
import type { Gallery } from "./gallery";

/** The room starts to shake when the swing is this close (degrees) to tearing loose. */
const SHAKE_WITHIN = 25;

export function createLeaningGallery(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new LeaningPendulumExhibit(R);
  const sync = new BodySync();
  const view = buildLeaningPendulumView(group, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  let heardBell = false;
  let wasSolved = false;
  let wasFailed = false;
  const shakeLevel = () =>
    exhibit.isFailed() ? 0 : Math.max(0, (exhibit.amplitude - (TEAR_LOOSE - SHAKE_WITHIN)) / SHAKE_WITHIN);

  return {
    id: "leaning-pendulum",
    title: "The Leaning Pendulum",
    group,
    xRange: [-44.5, -34],
    exhibit,
    sync,
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: [],
    setHovered() {},
    summary() {
      const gravity = GRAVITY_LABELS[exhibit.rule("gravity").current as GravityDirection] ?? "";
      return `Gravity: <b>${gravity.toLowerCase()}</b> · Swing <b>${Math.round(exhibit.amplitude)}°</b> · ${exhibit.rung ? "bell rung" : "bell silent"}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! Gravity points at the floor, a drag has calmed the swing, and the far door is open.";
      if (exhibit.tornLoose) return "The pendulum tore loose from its hook. Resetting…";
      if (exhibit.rung) return "The bell rang. Now bring gravity back to the floor and calm the swing, without tearing the pendulum loose.";
      return "Ring the bell, then bring gravity back to the floor and calm the swing. Hold Q to read the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      if (exhibit.rung && !heardBell) sound.bell(698.5);
      heardBell = exhibit.rung;
      const v = exhibit.bob.linvel();
      sound.setWhoosh(Math.hypot(v.x, v.y, v.z) / 9);
      sound.setRumble(shakeLevel());
      if (exhibit.isFailed() && !wasFailed) {
        sound.impact(1);
        sound.failed();
      }
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    shake: () => 0.035 * shakeLevel() ** 2,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
    },
    afterReset() {
      wasSolved = exhibit.isSolved(); // a room restored from saved progress is already solved: no chime
      wasFailed = exhibit.isFailed();
      heardBell = false;
      sound.setWhoosh(0);
      sound.setRumble(0);
    },
    silence() {
      sound.setWhoosh(0);
      sound.setRumble(0);
    },
  };
}
