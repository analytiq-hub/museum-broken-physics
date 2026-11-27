// Gallery II, the Restless Pendulum, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { HANDOVER_X, HANDOVER_X_23 } from "../exhibits/layout";
import { BELLS, DOORWAY_X, ENTRANCE, MAX_SWING, PendulumExhibit, RESET_SPOT } from "../exhibits/pendulum/sim";
import { CAMERA_POSES, buildPendulumView } from "../exhibits/pendulum/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery } from "./gallery";

/** The room starts to shake above this swing (degrees). */
const SHAKE_FROM = 55;
const BELL_PITCH: Record<string, number> = { "bell-low": 392, "bell-high": 587.3 };

export function createPendulumGallery(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new PendulumExhibit(R);
  const sync = new BodySync();
  const view = buildPendulumView(group, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  let heardRung = 0;
  let wasSolved = false;
  let wasFailed = false;
  const shakeLevel = () => (exhibit.isFailed() ? 0 : Math.max(0, (exhibit.amplitude - SHAKE_FROM) / (MAX_SWING - SHAKE_FROM)));

  return {
    id: "pendulum",
    title: "The Restless Pendulum",
    group,
    xRange: [-25.5, -15],
    exhibit,
    sync,
    recorder,
    owns: (x, margin) => x < HANDOVER_X + margin && x > HANDOVER_X_23 - margin,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: [],
    setHovered() {},
    summary() {
      const rung = BELLS.filter((b) => exhibit.rung.includes(b.name)).map((b) => b.label.toLowerCase());
      const bells = rung.length ? `rang the ${rung.join(" and ")}` : "no bells yet";
      return `Swing: <b>${Math.round(exhibit.amplitude)}°</b> · ${bells}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The pendulum is at rest and both bells have rung. The far door is open.";
      if (exhibit.vaseBroken) return "The bob smashed the vase. Resetting…";
      if (exhibit.shookApart) return "The swing grew so wild the room shook itself apart. Resetting…";
      if (exhibit.rung.length === BELLS.length) return "Both bells have rung. Calm the pendulum before it reaches the vase!";
      if (exhibit.changesLeft === 0 && exhibit.amplitude < 20) return "The swing is dying away with a bell still silent. Press R to try again.";
      return "Ring both bells, then calm the pendulum. Hold Q to read the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      while (heardRung < exhibit.rung.length) sound.bell(BELL_PITCH[exhibit.rung[heardRung++]] ?? 440);
      const v = exhibit.bob.linvel();
      sound.setWhoosh(Math.hypot(v.x, v.y, v.z) / 9);
      sound.setRumble(shakeLevel());
      if (exhibit.vaseBroken && !wasFailed) sound.shatter();
      if (exhibit.isFailed() && !wasFailed) sound.failed();
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
      heardRung = 0;
      sound.setWhoosh(0);
      sound.setRumble(0);
    },
    silence() {
      sound.setWhoosh(0);
      sound.setRumble(0);
    },
  };
}
