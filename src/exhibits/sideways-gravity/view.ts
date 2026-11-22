// Gray-box view of the sideways-gravity gallery: meshes for the room's boxes,
// the ball and door bound to their bodies, and a gravity arrow.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import { GRAVITY } from "../../rules/Rule";
import {
  BALL_RADIUS,
  DOOR,
  type Box,
  STATIC_BOXES,
  TARGET,
  type SidewaysGravityExhibit,
} from "./sim";

const MATERIALS: Record<Box["kind"], THREE.Material> = {
  floor: new THREE.MeshStandardMaterial({ color: 0xd9d3c7, roughness: 0.55 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0x5a554d, roughness: 0.9 }),
  wall: new THREE.MeshStandardMaterial({ color: 0xbdb5a6, roughness: 0.8 }),
  ledge: new THREE.MeshStandardMaterial({ color: 0x8f8778, roughness: 0.7 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xcfe6ee,
    roughness: 0.05,
    transparent: true,
    opacity: 0.08,
    depthWrite: false,
  }),
};

const BRASS = new THREE.MeshStandardMaterial({ color: 0xb5893b, roughness: 0.3, metalness: 0.9 });

export interface SidewaysGravityView {
  /** Call once per rendered frame. */
  update(): void;
}

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

  // Gravity arrow in the middle of the room (stand-in until the tell-tales exist).
  const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 3, 0), 1.6, 0xd4553a, 0.45, 0.3);
  scene.add(arrow);

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
  return {
    update() {
      const dir = GRAVITY[ex.rule("gravity").current as keyof typeof GRAVITY];
      arrow.setDirection(g.set(dir.x, dir.y, dir.z).normalize());
      plateMaterial.emissive.set(ex.isSolved() ? 0x7a5a10 : 0x000000);
    },
  };
}

function boxMesh(box: Box, material: THREE.Material): THREE.Mesh {
  const [hx, hy, hz] = box.half;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), material);
  mesh.position.set(...box.center);
  return mesh;
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
