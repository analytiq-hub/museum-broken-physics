// View of the Silver Vault: an oven and its lever at the east end of a long bench,
// slits, a magnet, and beyond it the beam (two clean halves, three, or a smear
// while it burns). The upper half lands on a glass wall that silvers over; behind
// the glass is the vault, glowing with the silver that has tunnelled in (a
// shimmering wave until measured), and a dark grate at its back. The lower half
// lands on a brass dump plate. A glass gauge beside the vault shows how much
// silver is inside, with a red line at what the door wants.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { AXIS_Z, BEAM_Y, DOOR, LEVER, MAGNET, NEED, OVEN_X, ROOM, SPLIT, STATIC_BOXES, VAULT, type VaultExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner along the beam line. */
  vault: { position: [-1.2, 2.7, 2.4] as V3, target: [-7.0, 1.2, -1.8] as V3 },
  /** Close on the glass, the vault and the gauge. */
  "vault-case": { position: [-7.6, 2.1, 0.9] as V3, target: [-9.5, 1.55, AXIS_Z] as V3 },
} as const;

export interface VaultView {
  update(dt: number): void;
  /** The oven lever's parts (userData.interact set by the gallery). */
  lever: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const BENCH_TOP = 0.9;
const UP_Y = BEAM_Y + SPLIT;
/** Silver amounts are shown against this full scale (all the silver that can reach the glass). */
const FULL = 0.5;
const GAUGE = { x: VAULT.glass + 0.45, z: AXIS_Z - 0.4, y0: BENCH_TOP + 0.1, h: 0.9 } as const;

/** Where a beam deflected by dy lands, just in front of the glass. */
function end(dy: number): THREE.Vector3 {
  return new THREE.Vector3(VAULT.glass + 0.02, BEAM_Y + dy, AXIS_Z);
}

/** A thin glowing rod from a to b. */
function rod(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const length = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8, 1, true), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

export function buildVaultView(scene: THREE.Object3D, ex: VaultExhibit, m: Materials): VaultView {
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

  // --- The oven: an iron box on the bench with a glowing mouth, and its lever.
  const iron = new THREE.MeshStandardMaterial({ color: 0x2c2826, metalness: 0.6, roughness: 0.55 });
  const oven = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.45), iron);
  oven.position.set(OVEN_X, BENCH_TOP + 0.25, AXIS_Z);
  oven.castShadow = true;
  scene.add(oven);
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x110805, emissive: 0xff7a2a, emissiveIntensity: 0 });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.08, 20), mouthMaterial);
  mouth.rotation.y = -Math.PI / 2;
  mouth.position.set(OVEN_X - 0.251, BEAM_Y, AXIS_Z);
  scene.add(mouth);
  for (const x of [OVEN_X - 0.7, OVEN_X - 1.2]) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.4), m.brass);
    slit.position.set(x, BEAM_Y, AXIS_Z);
    scene.add(slit);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, BEAM_Y - 0.2 - BENCH_TOP, 8), m.brass);
    stem.position.set(x, (BEAM_Y - 0.2 + BENCH_TOP) / 2, AXIS_Z);
    scene.add(stem);
  }
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 14), m.brass);
  post.position.set(LEVER.x, 0.5, LEVER.z);
  scene.add(post);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(LEVER.x, 1.0, LEVER.z);
  scene.add(leverPivot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), m.brass);
  handle.position.y = 0.22;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x8a5a1a, roughness: 0.35, clearcoat: 0.6 }));
  knob.position.y = 0.47;
  leverPivot.add(handle, knob);

  // --- The magnet: two iron pole pieces above and below the beam.
  const magnetLength = MAGNET.x0 - MAGNET.x1;
  for (const [y, h] of [
    [BEAM_Y + 0.22, 0.24],
    [BEAM_Y - 0.22, 0.24],
  ] as const) {
    const pole = new THREE.Mesh(new THREE.BoxGeometry(magnetLength, h, 0.5), iron);
    pole.position.set((MAGNET.x0 + MAGNET.x1) / 2, y, AXIS_Z);
    pole.castShadow = true;
    scene.add(pole);
  }
  const yoke = new THREE.Mesh(new THREE.BoxGeometry(magnetLength, 0.7, 0.12), new THREE.MeshStandardMaterial({ color: 0x7a1e1e, metalness: 0.4, roughness: 0.5 }));
  yoke.position.set((MAGNET.x0 + MAGNET.x1) / 2, BEAM_Y, AXIS_Z - 0.31);
  scene.add(yoke);
  const magnetStand = new THREE.Mesh(new THREE.BoxGeometry(magnetLength * 0.6, BEAM_Y - 0.34 - BENCH_TOP, 0.3), iron);
  magnetStand.position.set((MAGNET.x0 + MAGNET.x1) / 2, (BEAM_Y - 0.34 + BENCH_TOP) / 2, AXIS_Z);
  scene.add(magnetStand);

  // --- The beam, shown while the oven burns: before the magnet, then split by spin.
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const start = new THREE.Vector3(OVEN_X - 0.25, BEAM_Y, AXIS_Z);
  const split = new THREE.Vector3((MAGNET.x0 + MAGNET.x1) / 2, BEAM_Y, AXIS_Z);
  const trunk = rod(start, split, 0.012, beamMaterial);
  const halves = { up: rod(split, end(SPLIT), 0.012, beamMaterial), down: rod(split, end(-SPLIT), 0.012, beamMaterial), middle: rod(split, end(0), 0.012, beamMaterial) };
  const fanGeometry = new THREE.BufferGeometry().setFromPoints([split, end(SPLIT), end(-SPLIT)]);
  const fan = new THREE.Mesh(fanGeometry, new THREE.MeshBasicMaterial({ color: 0xd8e8ff, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(trunk, halves.up, halves.down, halves.middle, fan);

  // --- Where the beam lands: the glass wall (upper), a dark screen (between), the dump plate (lower).
  // The screen fills the gap between the dump plate and the vault, so the middle of a smear lands on iron.
  const screenTop = BEAM_Y + SPLIT - VAULT.halfY - 0.02;
  const screenBottom = BEAM_Y - SPLIT - 0.12;
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.03, screenTop - screenBottom, 0.6), iron);
  screen.position.set(VAULT.glass + 0.04, (screenTop + screenBottom) / 2, AXIS_Z);
  scene.add(screen);
  const dump = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.18, 0.3), m.brass);
  dump.position.set(VAULT.glass + 0.07, BEAM_Y - SPLIT, AXIS_Z);
  scene.add(dump);

  // --- The vault: a glass box at the upper half's height; its east face is the glass wall.
  const vaultLength = VAULT.glass - VAULT.back;
  const vaultCentre = new THREE.Vector3((VAULT.glass + VAULT.back) / 2, UP_Y, AXIS_Z);
  const vaultGlass = new THREE.Mesh(
    new THREE.BoxGeometry(vaultLength, VAULT.halfY * 2, VAULT.halfZ * 2),
    new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25, depthWrite: false }),
  );
  vaultGlass.position.copy(vaultCentre);
  scene.add(vaultGlass);
  const frameMaterial = m.brass;
  for (const [dy, dz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ]) {
    const edge = new THREE.Mesh(new THREE.BoxGeometry(vaultLength + 0.04, 0.03, 0.03), frameMaterial);
    edge.position.set(vaultCentre.x, UP_Y + dy * VAULT.halfY, AXIS_Z + dz * VAULT.halfZ);
    scene.add(edge);
  }
  const vaultStand = new THREE.Mesh(new THREE.BoxGeometry(vaultLength * 0.7, UP_Y - VAULT.halfY - BENCH_TOP, VAULT.halfZ * 1.4), m.wood);
  vaultStand.position.set(vaultCentre.x, (UP_Y - VAULT.halfY + BENCH_TOP) / 2, AXIS_Z);
  scene.add(vaultStand);
  // The silver film on the glass wall, the silver inside, and the grate at the back.
  const filmMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.25, transparent: true, opacity: 0 });
  const film = new THREE.Mesh(new THREE.PlaneGeometry(VAULT.halfZ * 2 - 0.04, VAULT.halfY * 2 - 0.04), filmMaterial);
  film.rotation.y = Math.PI / 2;
  film.position.set(VAULT.glass + 0.005, UP_Y, AXIS_Z);
  scene.add(film);
  const cloudMaterial = new THREE.MeshBasicMaterial({ color: 0xc8d4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const cloud = new THREE.Mesh(new THREE.BoxGeometry(vaultLength - 0.08, VAULT.halfY * 2 - 0.08, VAULT.halfZ * 2 - 0.08), cloudMaterial);
  cloud.position.copy(vaultCentre);
  scene.add(cloud);
  const ingotMaterial = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.2 });
  const ingot = new THREE.Mesh(new THREE.BoxGeometry(vaultLength - 0.2, 0.08, VAULT.halfZ * 2 - 0.2), ingotMaterial);
  ingot.position.set(vaultCentre.x, UP_Y - VAULT.halfY + 0.04, AXIS_Z);
  ingot.visible = false;
  scene.add(ingot);
  const grateMaterial = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0xc8d4ff, emissiveIntensity: 0, roughness: 0.8 });
  for (let i = -3; i <= 3; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.02, VAULT.halfY * 2, 0.02), grateMaterial);
    bar.position.set(VAULT.back - 0.01, UP_Y, AXIS_Z + i * 0.09);
    scene.add(bar);
  }

  // --- The gauge: a glass tube whose silver column shows what is in the vault.
  const tube = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, GAUGE.h, 16, 1, true),
    new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.3, depthWrite: false }),
  );
  tube.position.set(GAUGE.x, GAUGE.y0 + GAUGE.h / 2, GAUGE.z);
  scene.add(tube);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 16), new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 0.8, roughness: 0.25, emissive: 0x6a7280, emissiveIntensity: 0.6 }));
  column.geometry.translate(0, 0.5, 0);
  column.position.set(GAUGE.x, GAUGE.y0, GAUGE.z);
  scene.add(column);
  const redLine = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 24), new THREE.MeshBasicMaterial({ color: 0xd02a2a }));
  redLine.rotation.x = Math.PI / 2;
  redLine.position.set(GAUGE.x, GAUGE.y0 + (NEED / FULL) * GAUGE.h, GAUGE.z);
  scene.add(redLine);
  const gaugeBase = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 16), m.brass);
  gaugeBase.position.set(GAUGE.x, GAUGE.y0 - 0.05, GAUGE.z);
  scene.add(gaugeBase);

  scene.add(
    placard(
      {
        kicker: "FLOOR 3 · GALLERY XV",
        title: "The Silver Vault",
        lines: ["One pellet of silver. Two broken laws.", "The door opens for a vault", "found holding enough silver.", "What you have learnt here, use together."],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: cool and dim, so the beam and the vault glow.
  const key = new THREE.SpotLight(0xe8f0ff, 34, 18, Math.PI / 3.2, 0.85, 1.6);
  key.position.set(-4, ROOM.height - 0.3, 2.6);
  key.target.position.set(-7, 0.9, AXIS_Z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xd8e4ff, 3, 10, 1.6);
  fill.position.set(-8.5, 2.6, 1.2);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let time = 0;
  let leverAngle = 0;
  let glow = 0;
  let shownVault = 0;
  return {
    lever: [handle, knob, post],
    update(dt) {
      time += dt;
      leverAngle += ((ex.lit ? 1 : 0) - leverAngle) * Math.min(1, dt * 10);
      leverPivot.rotation.x = -0.5 + leverAngle * 1.4;
      // The oven glows while it burns; the beam shows with it.
      glow += ((ex.burning ? 1 : 0) - glow) * Math.min(1, dt * 6);
      mouthMaterial.emissiveIntensity = glow * 3;
      const flicker = glow * (0.75 + 0.25 * Math.sin(time * 40));
      beamMaterial.opacity = flicker * 0.9;
      const spin = ex.spin;
      halves.up.visible = halves.down.visible = spin !== "any";
      halves.middle.visible = spin === "three";
      (fan.material as THREE.MeshBasicMaterial).opacity = spin === "any" ? flicker * 0.35 : 0;
      // Silver: a film on the glass, a cloud (or, once measured, an ingot) in the vault.
      const s = ex.silver;
      filmMaterial.opacity = Math.min(0.9, (s.glass / FULL) * 1.6);
      const wave = ex.wave;
      cloudMaterial.opacity = wave ? Math.sqrt(s.vault / FULL) * (0.35 + 0.06 * Math.sin(time * 7)) : 0;
      ingot.visible = !wave && s.vault > 0.01;
      ingot.scale.y = Math.max(0.1, s.vault / FULL);
      grateMaterial.emissiveIntensity = wave ? Math.min(2, s.vault * 6) * (0.6 + 0.4 * Math.sin(time * 9)) : 0;
      shownVault += (s.vault - shownVault) * Math.min(1, dt * 8);
      column.scale.y = Math.max(0.001, Math.min(1, shownVault / FULL) * GAUGE.h);
      door.position.y = ex.door.translation().y;
    },
  };
}
