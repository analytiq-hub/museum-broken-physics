// The closing room at the end of the route: the museum's last placard.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Sound } from "../audio/sound";
import { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import { PassageExhibit } from "../exhibits/passage";
import { ENTRANCE, ROOM, STATIC_BOXES } from "../exhibits/the-end/sim";
import { Recorder } from "../debug/recorder";
import { worldBoxGeometry, type Materials } from "../render/materials";
import { placard } from "../render/placard";
import type { Gallery } from "./gallery";

export function createTheEndGallery(R: typeof RAPIER, scene: THREE.Object3D, m: Materials, _sound: Sound, getPlayer: () => Player): Gallery {
  const group = new THREE.Group();
  group.name = "gallery";
  scene.add(group);
  const exhibit = new PassageExhibit(R, "the-end", STATIC_BOXES);
  const materialOf = { floor: m.wood, ceiling: m.ceiling, wall: m.wall, glass: m.glass, ledge: m.ledge, pedestal: m.wood } as const;
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, box.kind === "floor" ? 7 : 3.2), materialOf[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  group.add(
    placard(
      {
        kicker: "THE END, FOR NOW",
        title: "More Galleries Ahead",
        lines: ["You have put right every law", "the museum has open so far.", "Its other floors are still being", "restored. Thank you for visiting."],
      },
      new THREE.Vector3(ROOM.xMin + 0.04, 1.5, 2),
      Math.PI / 2,
      m,
    ),
  );
  const light = new THREE.PointLight(0xffe2c0, 3.5, 6, 2);
  light.position.set((ROOM.xMin + ROOM.xMax) / 2, 2.6, 2);
  group.add(light);

  return {
    id: "the-end",
    title: "The End, For Now",
    group,
    xRange: [ROOM.xMin, ROOM.xMax + 0.5],
    exhibit,
    sync: new BodySync(),
    recorder: new Recorder(exhibit.id, () => getPlayer().getState()),
    entrance: ENTRANCE,
    entranceYaw: Math.PI / 2,
    cameraPoses: {},
    interactables: [],
    setHovered() {},
    summary: () => "The last room open so far",
    status: () => "Thank you for visiting the Museum of Broken Physics.",
    afterStep() {},
    update() {},
    shake: () => 0,
    beforeReset() {},
    afterReset() {},
    silence() {},
  };
}
