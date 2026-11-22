// View for the falling-cube scene: meshes bound to the sim's bodies.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import { CUBE_HALF_SIZE, FLOOR_HALF_EXTENTS, type FallingCubeSim } from "./sim";

export function buildFallingCubeView(scene: THREE.Scene, sim: FallingCubeSim, sync: BodySync): void {
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(FLOOR_HALF_EXTENTS.x * 2, FLOOR_HALF_EXTENTS.y * 2, FLOOR_HALF_EXTENTS.z * 2),
    new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.6 }), // gray-box "marble"
  );
  floor.receiveShadow = true;
  scene.add(floor);
  sync.bind(sim.floor, floor);

  const size = CUBE_HALF_SIZE * 2;
  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: 0xb5893b, roughness: 0.35, metalness: 0.8 }), // "brass"
  );
  cube.castShadow = true;
  scene.add(cube);
  sync.bind(sim.cube, cube);
}
