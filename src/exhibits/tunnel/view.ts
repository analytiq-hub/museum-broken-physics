// View of the Quantum Tunnel: a long glass case on a bench, split by thin glass
// walls into a well, a brass cup and a dark drain. Above the well, a brass claw and
// a lever that opens it. While the marble is a wave, each compartment glows with
// how much of its probability is there, and the marble is a faint ghost in the
// likeliest one; once measured, it is solid, where it was found.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import type { Compartment } from "./leak";
import { CASE, DOOR, LEVER, ROOM, STATIC_BOXES, type TunnelExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner along the case. */
  tunnel: { position: [-1.2, 2.6, 1.6] as V3, target: [-7.0, 0.9, -2.2] as V3 },
  /** Close along the case. */
  "tunnel-case": { position: [-7.0, 1.9, 0.4] as V3, target: [-7.0, CASE.y + 0.2, CASE.z] as V3 },
} as const;

export interface TunnelView {
  update(dt: number): void;
  /** The lever's parts (userData.interact set by the gallery). */
  lever: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const MARBLE_R = 0.09;

/** The middle of a compartment along the case. */
function centre(c: Compartment): number {
  const [a, b] = CASE[c];
  return (a + b) / 2;
}

export function buildTunnelView(scene: THREE.Object3D, ex: TunnelExhibit, m: Materials): TunnelView {
  const byKind: Record<Box["kind"], THREE.Material> = { floor: m.ledge, ceiling: m.ceiling, wall: m.wall, glass: m.glass, ledge: m.ledge, pedestal: m.wood };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal";
    scene.add(mesh);
  }
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);

  // --- The case: glass, with thin glass walls between the compartments.
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.22, depthWrite: false });
  const x0 = CASE.well[0];
  const x1 = CASE.drain[1];
  const shell = new THREE.Mesh(new THREE.BoxGeometry(x0 - x1, CASE.height, CASE.halfZ * 2), glass);
  shell.position.set((x0 + x1) / 2, CASE.y + CASE.height / 2, CASE.z);
  scene.add(shell);
  for (const x of [(CASE.well[1] + CASE.cup[0]) / 2, (CASE.cup[1] + CASE.drain[0]) / 2]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.03, CASE.height, CASE.halfZ * 2), new THREE.MeshPhysicalMaterial({ color: 0xcfe8f0, roughness: 0.05, transmission: 0.7, transparent: true, opacity: 0.45 }));
    wall.position.set(x, CASE.y + CASE.height / 2, CASE.z);
    scene.add(wall);
  }

  // --- The cup (brass) and the drain (a dark hole) inside their compartments.
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.08, 24, 1, true), m.brass);
  cup.position.set(centre("cup"), CASE.y + 0.04, CASE.z);
  scene.add(cup);
  const drain = new THREE.Mesh(new THREE.CircleGeometry(0.24, 24), new THREE.MeshBasicMaterial({ color: 0x050505 }));
  drain.rotation.x = -Math.PI / 2;
  drain.position.set(centre("drain"), CASE.y + 0.003, CASE.z);
  scene.add(drain);

  // --- Probability clouds: one glowing box per compartment.
  const clouds = (["well", "cup", "drain"] as Compartment[]).map((c) => {
    const [a, b] = CASE[c];
    const material = new THREE.MeshBasicMaterial({ color: 0x9a8cff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    const cloud = new THREE.Mesh(new THREE.BoxGeometry(a - b - 0.08, CASE.height - 0.08, CASE.halfZ * 2 - 0.08), material);
    cloud.position.set((a + b) / 2, CASE.y + CASE.height / 2, CASE.z);
    scene.add(cloud);
    return { c, material };
  });

  // --- The marble, the claw holding it over the well, and the lever.
  const marbleMaterial = new THREE.MeshPhysicalMaterial({ color: 0x3a6ad0, roughness: 0.15, clearcoat: 0.8, transparent: true, opacity: 1 });
  const marble = new THREE.Mesh(new THREE.SphereGeometry(MARBLE_R, 24, 16), marbleMaterial);
  marble.castShadow = true;
  scene.add(marble);
  const clawY = CASE.y + CASE.height + 0.15;
  const claw = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 20, Math.PI * 1.4), m.brass);
  claw.rotation.x = Math.PI / 2;
  claw.position.set(centre("well"), clawY, CASE.z);
  scene.add(claw);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 8), m.brass);
  arm.position.set(centre("well"), clawY + 0.45, CASE.z);
  scene.add(arm);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 14), m.brass);
  post.position.set(LEVER.x, 0.5, LEVER.z);
  scene.add(post);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(LEVER.x, 1.0, LEVER.z);
  scene.add(leverPivot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), m.brass);
  handle.position.y = 0.22;
  leverPivot.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x4a2a7a, roughness: 0.35, clearcoat: 0.6 }));
  knob.position.y = 0.47;
  leverPivot.add(knob);

  scene.add(
    placard(
      {
        kicker: "FLOOR 3 · GALLERY XII",
        title: "The Quantum Tunnel",
        lines: [
          "Here a marble is a wave, and waves leak",
          "through walls a marble could never climb.",
          "The door opens for a marble in the cup.",
          "Look at it at the right moment.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: cool and dim, so the clouds glow.
  const key = new THREE.SpotLight(0xe8f0ff, 28, 16, Math.PI / 3.2, 0.85, 1.6);
  key.position.set(-5, ROOM.height - 0.3, 2.5);
  key.target.position.set(-7, 0.8, CASE.z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xd8e4ff, 2.2, 9, 1.8);
  fill.position.set(-3, 2.6, 1.5);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let time = 0;
  let leverAngle = 0;
  let marbleX = centre("well");
  return {
    lever: [handle, knob, post],
    update(dt) {
      time += dt;
      const p = ex.probabilities;
      const wave = ex.released && ex.found === null;
      // Clouds glow with their share of the probability (shimmering while it is a wave).
      for (const { c, material } of clouds) material.opacity = wave ? Math.sqrt(p[c]) * (0.28 + 0.05 * Math.sin(time * 7 + c.length)) : 0;
      // The marble: in the claw, a ghost in the likeliest compartment, or solid where it was found.
      leverAngle += ((ex.released ? 1 : 0) - leverAngle) * Math.min(1, dt * 10);
      leverPivot.rotation.x = -0.5 + leverAngle * 1.4;
      claw.rotation.z = ex.released ? 0.8 : 0;
      const likeliest = (Object.keys(p) as Compartment[]).reduce((a, b) => (p[b] > p[a] ? b : a), "well");
      const where = ex.found ?? likeliest;
      const targetX = centre(where);
      marbleX += (targetX - marbleX) * Math.min(1, dt * (wave ? 1.5 : 6));
      const lost = where === "drain" && !wave;
      marble.position.set(marbleX, ex.released ? (lost ? CASE.y - 0.3 : CASE.y + MARBLE_R + (where === "cup" ? 0.04 : 0)) : clawY - 0.02, CASE.z);
      marbleMaterial.opacity = wave ? 0.25 + 0.1 * Math.sin(time * 5) : 1;
      marble.visible = !lost;
      door.position.y = ex.door.translation().y;
    },
  };
}
