// Milestone 0 test scene: a cube falls onto a floor.
// Simulation only (Rapier). Must not import three.js or touch the DOM.
import type RAPIER from "@dimforge/rapier3d-compat";
import { createWorld } from "../../engine/physics";

export const FLOOR_HALF_EXTENTS = { x: 10, y: 0.5, z: 10 } as const;
export const CUBE_HALF_SIZE = 0.5;
export const CUBE_START = { x: 0, y: 5, z: 0 } as const;

export interface FallingCubeSim {
  world: RAPIER.World;
  floor: RAPIER.RigidBody;
  cube: RAPIER.RigidBody;
}

export function buildFallingCubeSim(R: typeof RAPIER): FallingCubeSim {
  const world = createWorld(R);

  // Floor: top surface at y = 0.
  const floor = world.createRigidBody(
    R.RigidBodyDesc.fixed().setTranslation(0, -FLOOR_HALF_EXTENTS.y, 0),
  );
  world.createCollider(
    R.ColliderDesc.cuboid(FLOOR_HALF_EXTENTS.x, FLOOR_HALF_EXTENTS.y, FLOOR_HALF_EXTENTS.z),
    floor,
  );

  // Cube, slightly tilted so it tumbles on landing rather than landing flat.
  const cube = world.createRigidBody(
    R.RigidBodyDesc.dynamic()
      .setTranslation(CUBE_START.x, CUBE_START.y, CUBE_START.z)
      .setRotation({ x: 0.2, y: 0.1, z: 0.1, w: 0.97 }),
  );
  world.createCollider(
    R.ColliderDesc.cuboid(CUBE_HALF_SIZE, CUBE_HALF_SIZE, CUBE_HALF_SIZE).setRestitution(0.2),
    cube,
  );

  return { world, floor, cube };
}
