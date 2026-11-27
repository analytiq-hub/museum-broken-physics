// View of the Grand Stair: a tall marble hall with one wide flight of steps, brass
// handrails, a hanging lantern, and two placards: "Floor 1 complete" at the foot
// of the stairs and Floor 2's welcome on the landing. It draws the corridor that
// leaves for Floor 2 (it is that corridor's east end).
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { RISE, ROOM, STAIR, STATIC_BOXES } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the foot of the stairs, looking up to the landing. */
  stairwell: { position: [-0.9, 1.7, 2.0] as V3, target: [-10, 4.6, 2.0] as V3 },
} as const;

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 2 };

export function buildStairwellView(scene: THREE.Object3D, m: Materials): { update(dt: number): void } {
  const byKind: Record<Box["kind"], THREE.Material> = {
    floor: m.floor,
    ceiling: m.ceiling,
    wall: m.wall,
    glass: m.glass,
    ledge: m.ledge,
    pedestal: m.ledge, // the landing is marble masonry, like the steps
  };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal";
    scene.add(mesh);
  }

  // --- The steps: solid marble, each from the floor up (the ramp collider runs through their noses).
  const depth = (STAIR.x0 - STAIR.x1) / STAIR.steps;
  const rise = RISE / STAIR.steps;
  const width = ROOM.z1 - ROOM.z0;
  for (let i = 0; i < STAIR.steps; i++) {
    const top = (i + 1) * rise - rise / 2;
    const half: V3 = [depth / 2, top / 2, width / 2];
    const center: V3 = [STAIR.x0 - (i + 0.5) * depth, top / 2, (ROOM.z0 + ROOM.z1) / 2];
    const step = new THREE.Mesh(worldBoxGeometry(half, center, TILE.ledge), m.ledge);
    step.position.set(...center);
    step.receiveShadow = true;
    step.castShadow = true;
    scene.add(step);
    // A brass nosing strip on each tread.
    const nosing = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.02, width), m.brass);
    nosing.position.set(STAIR.x0 - i * depth - 0.02, top + 0.01, center[2]);
    scene.add(nosing);
  }

  // --- Brass handrails along both walls, up the flight and across the landing.
  const rail = (a: THREE.Vector3, b: THREE.Vector3) => {
    const length = a.distanceTo(b);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, length, 10), m.brass);
    bar.position.copy(a).add(b).multiplyScalar(0.5);
    bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    scene.add(bar);
  };
  for (const z of [ROOM.z0 + 0.07, ROOM.z1 - 0.07]) {
    rail(new THREE.Vector3(ROOM.xMax - 0.1, 0.95, z), new THREE.Vector3(STAIR.x0, 0.95, z));
    rail(new THREE.Vector3(STAIR.x0, 0.95, z), new THREE.Vector3(STAIR.x1, RISE + 0.95, z));
    rail(new THREE.Vector3(STAIR.x1, RISE + 0.95, z), new THREE.Vector3(ROOM.xMin + 0.1, RISE + 0.95, z));
  }

  // --- Placards: Floor 1's farewell at the foot, Floor 2's welcome on the landing.
  scene.add(
    placard(
      {
        kicker: "FLOOR 1 COMPLETE",
        title: "The Grand Stair",
        lines: [
          "You have put right gravity, damping",
          "and the bounce of a ball: things you can see.",
          "Upstairs, light, sound and heat have broken.",
          "Some of what's wrong there can't be seen.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 1.3, 1.55, ROOM.z1 - 0.04),
      Math.PI,
      m,
    ),
  );
  scene.add(
    placard(
      {
        kicker: "FLOOR 2",
        title: "Waves and Light",
        lines: [
          "Here the broken laws are harder to see:",
          "a beam that bends the wrong way,",
          "a note that's out of tune.",
          "Watch what they do, then work out why.",
        ],
      },
      new THREE.Vector3(ROOM.xMin + 1.2, RISE + 1.55, ROOM.z1 - 0.04),
      Math.PI,
      m,
    ),
  );

  // --- Lighting: a key from high over the foot of the stairs, a hanging lantern, the landing.
  const key = new THREE.SpotLight(0xfff0dc, 60, 20, Math.PI / 3.5, 0.8, 1.5);
  key.position.set(ROOM.xMax - 0.4, ROOM.height - 0.4, 2);
  key.target.position.set(STAIR.x1, RISE, 2);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 2.2, 6), m.brass);
  cord.position.set(-6, ROOM.height - 1.1, 2);
  scene.add(cord);
  const lantern = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a1d0e, emissive: 0xffd9a0, emissiveIntensity: 1.6 }),
  );
  lantern.position.set(-6, ROOM.height - 2.4, 2);
  scene.add(lantern);
  const glow = new THREE.PointLight(0xffd9a0, 6, 10, 1.8);
  glow.position.copy(lantern.position);
  scene.add(glow);
  const foot = new THREE.PointLight(0xffe2c0, 2.5, 6, 2);
  foot.position.set(ROOM.xMax - 1.5, 2.4, 2);
  scene.add(foot);
  const landing = new THREE.PointLight(0xffe2c0, 3, 6, 2);
  landing.position.set(ROOM.xMin + 1.2, RISE + 2.4, 2);
  scene.add(landing);
  // A low light halfway along the corridor to Floor 2 (this hall draws that corridor).
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, RISE + 2.4, 2);
  scene.add(corridorLight);

  return { update() {} };
}
