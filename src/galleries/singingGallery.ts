// Gallery VI, the Singing Glass, as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, GLASSES, PIPE_NAMES, RESET_SPOT, SPEED_MARKS, SingingGlassExhibit } from "../exhibits/singing-glass/sim";
import { CAMERA_POSES, buildSingingGlassView } from "../exhibits/singing-glass/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

export function createSingingGallery(
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new SingingGlassExhibit(R);
  const sync = new BodySync();
  const view = buildSingingGlassView(group, exhibit, sync, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // Each pipe sounds until it's clicked again (free; pipes are controls, not laws).
  view.pipes.forEach((pipe, i) => {
    pipe.userData.interact = {
      rule: "pipe",
      value: `${i}`,
      label: `Sound the ${PIPE_NAMES[i]} pipe`,
      doneLabel: `Click: stop the ${PIPE_NAMES[i]} pipe`,
      offValue: "none",
    } satisfies Interactable;
  });

  let wasCracked = new Set<string>();
  let wasSolved = false;
  let wasFailed = false;
  const syncFlags = () => {
    wasCracked = new Set(GLASSES.filter((g) => exhibit.glass(g.id).cracked).map((g) => g.id));
    wasSolved = exhibit.isSolved();
    wasFailed = exhibit.isFailed();
  };
  const speedLabel = () => {
    const v = exhibit.rule("speed").current as number;
    return SPEED_MARKS.find((mk) => mk.value === v)?.label ?? `${v} m/s`;
  };
  const silenceAll = () => {
    sound.setPipe(null);
    for (const g of GLASSES) sound.setGlass(g.id, g.f0, 0);
  };

  return {
    id: "singing-glass",
    title: "The Singing Glass",
    group,
    xRange: [-106.5, -92.5],
    exhibit,
    sync,
    recorder,
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: CAMERA_POSES,
    interactables: view.pipes,
    setHovered() {},
    summary() {
      const p = exhibit.sounding;
      return `Speed of sound: <b>${speedLabel().toLowerCase()}</b> · ${p === null ? "the organ is silent" : `pipe ${p + 1} sounding`}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The pane has shattered, and the way on is open.";
      if (exhibit.isFailed()) return "The harmonica has shattered. The room will reset.";
      if (exhibit.glass("harmonica").cracked) return "The harmonica has cracked! Stop that note before it breaks.";
      if (exhibit.glass("pane").cracked) return "The pane has cracked. Keep it singing…";
      return "Shatter the pane, but spare the harmonica. Click a pipe to sound it; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      sound.setPipe(exhibit.isSolved() || exhibit.isFailed() ? null : exhibit.tone);
      for (const g of GLASSES) {
        const state = exhibit.glass(g.id);
        sound.setGlass(g.id, g.f0, state.broken ? 0 : state.amplitude);
        if (state.cracked && !wasCracked.has(g.id) && !state.broken) sound.click(); // a tick as it cracks
      }
      if (exhibit.isSolved() && !wasSolved) {
        sound.shatter();
        sound.solved();
      }
      if (exhibit.isFailed() && !wasFailed) {
        sound.shatter();
        sound.failed();
      }
      syncFlags();
    },
    shake: () => 0,
    beforeReset(player) {
      if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the pane is about to come back
    },
    afterReset() {
      syncFlags(); // a room restored from saved progress is already solved: no crash of glass
    },
    silence() {
      silenceAll();
    },
  };
}
