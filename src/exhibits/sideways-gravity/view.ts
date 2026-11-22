// Gray-box view of the sideways-gravity gallery: meshes for the room's boxes,
// the ball and door bound to their bodies, and the gravity tell-tales (plumb
// line, loose debris, drifting dust) that show the player which way is "down".
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import { GRAVITY, type GravityDirection } from "../../rules/Rule";
import {
  BALL_RADIUS,
  DEBRIS,
  DOOR,
  PLUMB_BOB_RADIUS,
  PLUMB_PIVOT,
  ROOM,
  type Box,
  CONSOLE,
  GRAVITY_LABELS,
  STATIC_BOXES,
  TARGET,
  type SidewaysGravityExhibit,
} from "./sim";

const MATERIALS: Record<Box["kind"], THREE.Material> = {
  floor: new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.55 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x5a554d, roughness: 0.9 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xbdb5a6, roughness: 0.8 }),
  ledge: new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.7 }),
  pedestal: new THREE.MeshStandardMaterial({ color: 0x4a3f33, roughness: 0.5 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xcfe6ee,
    roughness: 0.05,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  }),
};

const BRASS = new THREE.MeshStandardMaterial({ color: 0xb5893b, roughness: 0.3, metalness: 0.9 });

type V3 = [number, number, number];

/** Named camera poses: the player's fixed view plus debugging angles for screenshots. */
export const CAMERA_POSES = {
  /** Eye height at the back of the viewing hall, looking in through the window. */
  window: { position: [0, 1.7, 8.2] as V3, target: [0, 2.6, 0] as V3 },
  /** Inside, up in the front-left corner by the ceiling: shows heights and the ledge's east-end gap. */
  overview: { position: [-5.5, 5.6, 3.7] as V3, target: [2.5, 2, -2.5] as V3 },
  /** Close on the ledge and target. */
  ledge: { position: [-2, 4.2, 2.5] as V3, target: [-4.5, 3.2, -3.2] as V3 },
} as const;

export interface SidewaysGravityView {
  /** Call once per rendered frame with the frame time in seconds. */
  update(dt: number): void;
  /** Console buttons, for raycasting; each mesh has userData.gravity. */
  buttons: THREE.Object3D[];
  /** Highlights the console button under the crosshair (or none). */
  setHovered(direction: GravityDirection | undefined): void;
}

const DUST_COUNT = 400;
/** Dust drifts along gravity this fast (m/s): slow, so it reads as floating motes. */
const DUST_DRIFT = 0.35;

export function buildSidewaysGravityView(
  scene: THREE.Scene,
  ex: SidewaysGravityExhibit,
  sync: BodySync,
): SidewaysGravityView {
  for (const box of STATIC_BOXES) {
    const mesh = boxMesh(box, MATERIALS[box.kind]);
    mesh.receiveShadow = box.kind !== "glass";
    mesh.castShadow = box.kind === "ledge";
    scene.add(mesh);
  }

  // Target: a brass plate on the ledge's west end that glows once solved.
  const [tx, ty, tz] = TARGET.center;
  const plateMaterial = BRASS.clone();
  const plate = new THREE.Mesh(
    new THREE.BoxGeometry(TARGET.half[0] * 2 - 0.1, 0.04, TARGET.half[2] * 2 - 0.1),
    plateMaterial,
  );
  plate.position.set(tx, ty - TARGET.half[1] + 0.02, tz);
  plate.receiveShadow = true;
  scene.add(plate);
  // The ledge top is above eye height, so mark the target with an upright plaque too.
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(TARGET.half[0] * 2 - 0.2, 1.1, 0.04), plateMaterial);
  plaque.position.set(tx, ty + 0.1, -3.98);
  scene.add(plaque);

  // Door: bound to its kinematic body so it sinks into the floor when solved.
  const door = boxMesh(DOOR, new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.6 }));
  door.castShadow = true;
  scene.add(door);
  sync.bind(ex.door, door);

  // Ball: banded marble, so rolling is visible.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 48, 24),
    new THREE.MeshStandardMaterial({ map: bandedTexture(), roughness: 0.25 }),
  );
  ball.castShadow = true;
  scene.add(ball);
  sync.bind(ex.ball, ball);

  // --- Gravity console: five brass buttons on a slanted panel, laid out like the
  // room as seen from the viewing hall (back wall at the top, window at the bottom).
  const consoleTop = CONSOLE.center[1] + CONSOLE.half[1];
  const panelGroup = new THREE.Group();
  // Tilt the face toward a player approaching from the hall, with its lower edge
  // resting on the pedestal top.
  const tilt = 0.45;
  panelGroup.position.set(CONSOLE.center[0], consoleTop + Math.sin(tilt) * (PANEL.depth / 2) + 0.03, CONSOLE.center[2]);
  panelGroup.rotation.x = tilt;
  scene.add(panelGroup);
  const face = new THREE.Mesh(new THREE.BoxGeometry(PANEL.width, 0.04, PANEL.depth), BRASS);
  face.castShadow = true;
  panelGroup.add(face);
  const labels = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL.width - 0.04, PANEL.depth - 0.04),
    new THREE.MeshStandardMaterial({ map: consoleLabels(), transparent: true, roughness: 0.6 }),
  );
  labels.rotation.x = -Math.PI / 2;
  labels.position.y = 0.021;
  panelGroup.add(labels);

  const buttonMaterials = new Map<GravityDirection, THREE.MeshStandardMaterial>();
  const buttonMeshes = new Map<GravityDirection, THREE.Mesh>();
  for (const [direction, [x, z]] of Object.entries(BUTTON_LAYOUT) as [GravityDirection, [number, number]][]) {
    const material = BRASS.clone();
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.04, 24), material);
    button.position.set(x, 0.04, z);
    button.userData.gravity = direction;
    panelGroup.add(button);
    buttonMaterials.set(direction, material);
    buttonMeshes.set(direction, button);
  }
  let hovered: GravityDirection | undefined;

  // --- Gravity tell-tales ---------------------------------------------------
  // Plumb line: brass bracket, a thin line, and the brass bob bound to its body.
  const pivot = new THREE.Vector3(PLUMB_PIVOT.x, PLUMB_PIVOT.y, PLUMB_PIVOT.z);
  const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, ROOM.height - PLUMB_PIVOT.y), BRASS);
  bracket.position.set(pivot.x, (ROOM.height + PLUMB_PIVOT.y) / 2, pivot.z);
  scene.add(bracket);
  const bob = new THREE.Mesh(new THREE.ConeGeometry(PLUMB_BOB_RADIUS, PLUMB_BOB_RADIUS * 2.5, 16), BRASS);
  bob.castShadow = true;
  // The joint keeps the pivot at local (−L, 0, 0) in the bob's frame, so pointing
  // the cone's tip (+y) along local +x always points it away from the pivot.
  bob.rotation.z = -Math.PI / 2;
  const bobHolder = new THREE.Group();
  bobHolder.add(bob);
  scene.add(bobHolder);
  sync.bind(ex.plumbBob, bobHolder);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([pivot, pivot.clone()]);
  const plumbLine = new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xe8dcc0 }));
  scene.add(plumbLine);

  // Loose debris: chips of stone bound to their bodies.
  const stone = new THREE.MeshStandardMaterial({ color: 0x9c9384, roughness: 0.9 });
  ex.debris.forEach((body, i) => {
    const s = DEBRIS[i][0] * 2;
    const chip = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), stone);
    chip.castShadow = true;
    scene.add(chip);
    sync.bind(body, chip);
  });

  // Dust: view-only motes drifting along gravity, wrapping around inside the room.
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (Math.random() * 2 - 1) * ROOM.halfX;
    dustPositions[i * 3 + 1] = Math.random() * ROOM.height;
    dustPositions[i * 3 + 2] = (Math.random() * 2 - 1) * ROOM.halfZ;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    new THREE.PointsMaterial({ color: 0xfff1d0, size: 0.03, transparent: true, opacity: 0.7, depthWrite: false }),
  );
  scene.add(dust);

  // Room lights.
  const lamp = new THREE.PointLight(0xffe2b8, 40, 18, 1.6);
  lamp.position.set(0, 5.6, -1);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  scene.add(lamp);
  const spot = new THREE.SpotLight(0xfff0d0, 60, 12, Math.PI / 7, 0.5, 1.5);
  spot.position.set(-4, 5.8, -1.5);
  spot.target.position.set(tx, ty, tz);
  scene.add(spot, spot.target);

  const g = new THREE.Vector3();
  const bounds = [ROOM.halfX, ROOM.height / 2, ROOM.halfZ];
  const centre = [0, ROOM.height / 2, 0];
  return {
    buttons: [...buttonMeshes.values()],
    setHovered(direction) {
      hovered = direction;
    },
    update(dt: number) {
      const dir = GRAVITY[ex.rule("gravity").current as keyof typeof GRAVITY];
      g.set(dir.x, dir.y, dir.z).normalize();
      plateMaterial.emissive.set(ex.isSolved() ? 0x7a5a10 : 0x000000);

      // Console: the active direction glows and sits pressed in; the hovered one brightens.
      const current = ex.rule("gravity").current as GravityDirection;
      for (const [direction, material] of buttonMaterials) {
        const active = direction === current;
        material.emissive.set(active ? 0x8a6418 : direction === hovered ? 0x4a3a18 : 0x000000);
        buttonMeshes.get(direction)!.position.y = active ? 0.025 : 0.04;
      }

      // Plumb line from the pivot to the bob.
      lineGeometry.attributes.position.setXYZ(1, bobHolder.position.x, bobHolder.position.y, bobHolder.position.z);
      lineGeometry.attributes.position.needsUpdate = true;

      // Dust drifts along gravity with a little shimmer, and wraps inside the room.
      const p = dustGeometry.attributes.position as THREE.BufferAttribute;
      const step = [g.x * DUST_DRIFT * dt, g.y * DUST_DRIFT * dt, g.z * DUST_DRIFT * dt];
      for (let i = 0; i < DUST_COUNT; i++) {
        for (let a = 0; a < 3; a++) {
          let v = p.array[i * 3 + a] + step[a] + (Math.random() - 0.5) * 0.004;
          const lo = centre[a] - bounds[a];
          const hi = centre[a] + bounds[a];
          if (v < lo) v = hi;
          else if (v > hi) v = lo;
          p.array[i * 3 + a] = v;
        }
      }
      p.needsUpdate = true;
    },
  };
}

function boxMesh(box: Box, material: THREE.Material): THREE.Mesh {
  const [hx, hy, hz] = box.half;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), material);
  mesh.position.set(...box.center);
  return mesh;
}

/** The console's slanted brass face (m). */
const PANEL = { width: 0.9, depth: 0.8 } as const;

/** Button positions on the console face (local x, z; −z is the top edge). Labels sit below each. */
const BUTTON_LAYOUT: Record<GravityDirection, [number, number]> = {
  north: [0, -0.22],
  west: [-0.28, 0],
  down: [0, 0],
  east: [0.28, 0],
  south: [0, 0.22],
};
/** Label offset below a button's centre (m, toward the player). */
const LABEL_OFFSET = 0.08;

/** Engraved labels under each console button. */
function consoleLabels(): THREE.Texture {
  const w = PANEL.width - 0.04;
  const d = PANEL.depth - 0.04;
  const W = 512;
  const H = Math.round((W * d) / w);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#2a1f12";
  ctx.font = "600 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const [direction, [x, z]] of Object.entries(BUTTON_LAYOUT) as [GravityDirection, [number, number]][]) {
    const u = ((x + w / 2) / w) * W;
    const v = ((z + LABEL_OFFSET + d / 2) / d) * H;
    ctx.fillText(GRAVITY_LABELS[direction].toUpperCase(), u, v - 11);
  }
  ctx.font = "700 20px system-ui, sans-serif";
  ctx.letterSpacing = "4px";
  ctx.fillText("GRAVITY", W / 2, 10);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function bandedTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ece6da";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#7d6e5a";
  for (let i = 0; i < 4; i++) ctx.fillRect(i * 64, 0, 14, 128);
  ctx.fillRect(0, 58, 256, 12);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
