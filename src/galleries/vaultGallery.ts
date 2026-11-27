// Gallery XV, the Silver Vault (Floor 3's finale), as the game runs it.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { DOORWAY_X, ENTRANCE, NEED, PLANCK_MARKS, RESET_SPOT, ROOM, SPIN_MARKS, VaultExhibit } from "../exhibits/vault/sim";
import { CAMERA_POSES, buildVaultView } from "../exhibits/vault/view";
import { Recorder } from "../debug/recorder";
import type { Materials } from "../render/materials";
import type { Gallery, Interactable } from "./gallery";

const percent = (v: number) => `${Math.round(v * 100)}%`;

export function createVaultGallery(R: typeof RAPIER, scene: THREE.Object3D, materials: Materials, sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new VaultExhibit(R);
  const view = buildVaultView(group, exhibit, materials);
  const recorder = new Recorder(exhibit.id, () => getPlayer().getState());

  // The lever lights the oven, which burns its one pellet (free: a control).
  const lever = { rule: "oven", value: "lit", label: "Light the oven", doneLabel: "The oven has been lit" } satisfies Interactable;
  for (const part of view.lever) part.userData.interact = lever;

  let wasBurning = false;
  let wasSolved = false;
  let wasFailed = false;

  return {
    id: "vault",
    title: "The Silver Vault",
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
      const spin = SPIN_MARKS.find((mk) => mk.value === exhibit.spin)?.label ?? exhibit.spin;
      const h = exhibit.rule("planck").current as number;
      const planck = PLANCK_MARKS.find((mk) => mk.value === h)?.label ?? String(h);
      const s = exhibit.silver;
      return `Spin: <b>${spin}</b> · Planck's constant: <b>${planck}</b> · silver on the glass ${percent(s.glass)} · in the vault ${percent(s.vault)}`;
    },
    status() {
      if (exhibit.isSolved()) return "Solved! The vault was found holding the silver, and the door has opened.";
      if (exhibit.isFailed()) return `The vault can't reach the red line (${percent(NEED)} of the pellet) now. The room will reset.`;
      if (exhibit.burning) return "The oven is burning its pellet of silver…";
      if (exhibit.spent && exhibit.wave) return "The silver is spreading through the glass…";
      return "Fill the vault to the red line with one pellet of silver. Pull the lever to light the oven; hold Q for the room's laws.";
    },
    afterStep() {},
    update(dt) {
      view.update(dt);
      const burning = exhibit.burning;
      if (burning && !wasBurning) sound.hiss();
      wasBurning = burning;
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
      wasBurning = exhibit.burning;
      wasSolved = exhibit.isSolved();
      wasFailed = exhibit.isFailed();
    },
    silence() {},
  };
}
