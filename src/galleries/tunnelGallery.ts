// Gallery XII, the Quantum Tunnel, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, PLANCK_MARKS, RESET_SPOT, ROOM, TunnelExhibit } from "../exhibits/tunnel/sim";
import { CAMERA_POSES, buildTunnelView } from "../exhibits/tunnel/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

const percent = (v: number) => `${Math.round(v * 100)}%`;

export function createTunnelGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new TunnelExhibit(R);
  const view = buildTunnelView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The lever opens the claw and drops the marble into the well (free: a control).
  const lever = { rule: "lever", value: "pulled", label: "Pull the lever", doneLabel: "The lever is pulled" } satisfies Interactable;
  for (const part of view.lever) part.userData.interact = lever;

  let wasFound: string | null = null;
  let wasSolved = false;
  let wasFailed = false;

  return {
    id: "tunnel",
    title: "The Quantum Tunnel",
    group,
    xRange: [ROOM.xMin - 8.5, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.lever,
    setHovered() {},
    summary() {
      const h = exhibit.rule("planck").current as number;
      const label = PLANCK_MARKS.find((mk) => mk.value === h)?.label ?? String(h);
      const p = exhibit.probabilities;
      return `Planck's constant: <b>${label}</b> · well ${percent(p.well)} · ring ${percent(p.cup)} · drain ${percent(p.drain)}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The marble was found on the ring, and the door has opened.";
      if (exhibit.isFailed()) return "The marble is lost down the drain. The room will reset.";
      if (exhibit.found === "well") return "Found in the well, and now it is a marble again: it will never get through. Reset to try again.";
      if (exhibit.released) return "The marble is spreading through the glass…";
      return "Put the marble on the ring. Pull the lever to drop it into the well; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      if (exhibit.found && exhibit.found !== wasFound) sound.click();
      if (exhibit.isSolved() && !wasSolved) {
        sound.solved();
        sound.door();
      }
      if (exhibit.isFailed() && !wasFailed) sound.failed();
      wasFound = exhibit.found;
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
    },
    afterReset() {
      wasFound = exhibit.found;
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    silence() {},
  };
}
