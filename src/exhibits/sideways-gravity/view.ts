// Gray-box view of the sideways-gravity gallery: meshes for the room's boxes,
// the ball and door bound to their bodies, and the gravity tell-tales (plumb
// line, loose debris, drifting dust) that show the player which way is "down".
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import { GRAVITY } from "../../rules/Rule";
import {
  BALL_RADIUS,
  DEBRIS,
  DOOR,
  PLUMB_BOB_RADIUS,
  PLUMB_PIVOT,
  ROOM,
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
  /** Call once per rendered frame with the frame time in seconds. */
  update(dt: number): void;
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
    update(dt: number) {
      const dir = GRAVITY[ex.rule("gravity").current as keyof typeof GRAVITY];
      g.set(dir.x, dir.y, dir.z).normalize();
      plateMaterial.emissive.set(ex.isSolved() ? 0x7a5a10 : 0x000000);

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
