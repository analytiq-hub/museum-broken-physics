// View of the Bouncing Hall: a tall marble hall with a red rubber ball hanging
// in a brass claw over an anvil, a slanted brass deflector high above it, a
// felt-lined balcony on the west wall, a glass skylight, the lever that drops
// the ball, and the corridor beyond the exit door to Gallery VI.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import {
  BALCONY,
  BALCONY_EDGE,
  BALL_RADIUS,
  DEFLECTOR,
  DOOR,
  DROP_HEIGHT,
  DROP_X,
  LANE_Z,
  LEVER,
  ROOM,
  STATIC_BOXES,
  type BouncingExhibit,
} from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner, over the anvil, deflector and balcony. */
  bouncing: { position: [-72.6, 3.6, 4.4] as V3, target: [-81.5, 2.6, -2.6] as V3 },
  /** Close on the balcony and the deflector. */
  "bouncing-balcony": { position: [-78.5, 4.2, -0.5] as V3, target: [-82.6, 3.6, -3] as V3 },
} as const;

export interface BouncingView {
  update(dt: number): void;
  /** The lever's parts, for raycasting (userData.interact set by the gallery). */
  lever: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };

export function buildBouncingView(scene: THREE.Object3D, ex: BouncingExhibit, sync: BodySync, m: Materials): BouncingView {
  const byKind: Record<Box["kind"], THREE.Material> = {
    floor: m.floor,
    ceiling: m.ceiling,
    wall: m.wall,
    glass: m.glass,
    ledge: m.ledge,
    pedestal: m.wood,
  };
  // Gallery IV draws the corridor (it is the east end of it).
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor45-"))) {
    const brass = box.name === "anvil" || box.name === "balcony-railing";
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), brass ? m.brass : byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal" || box.name === "balcony";
    scene.add(mesh);
  }
  buildTrim(scene, m);

  // --- The exit door, which sinks when the room is solved.
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);
  sync.bind(ex.door, door);

  // --- The balcony's green felt, and brass brackets under it.
  const felt = new THREE.Mesh(
    new THREE.PlaneGeometry(BALCONY.depth, BALCONY.z1 - BALCONY.z0),
    new THREE.MeshStandardMaterial({ color: 0x24543a, roughness: 0.95 }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.position.set(ROOM.xMin + BALCONY.depth / 2, BALCONY.y0 + 0.004, LANE_Z);
  felt.receiveShadow = true;
  scene.add(felt);
  for (const z of [BALCONY.z0 + 0.15, BALCONY.z1 - 0.15]) {
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.06), m.brass);
    const length = Math.hypot(BALCONY.depth * 0.8, 0.9);
    bracket.scale.set(1, length / 0.06, 1);
    bracket.position.set(ROOM.xMin + BALCONY.depth * 0.4, BALCONY.y0 - BALCONY.thickness - 0.45, z);
    bracket.rotation.z = Math.atan2(BALCONY.depth * 0.8, 0.9);
    scene.add(bracket);
  }

  // --- The anvil's brass column base, under the plate.
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.02, 24), m.brass);
  column.position.set(DROP_X, 0.01, LANE_Z);
  scene.add(column);

  // --- The ball: red rubber.
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xb8322a, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.5 }),
  );
  ball.castShadow = true;
  scene.add(ball);
  sync.bind(ex.ball, ball);

  // --- The claw: an arm from the north wall, with two prongs that swing open on release.
  const clawY = DROP_HEIGHT + BALL_RADIUS + 0.06;
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, Math.abs(-ROOM.halfZ - LANE_Z), 12), m.brass);
  arm.rotation.x = Math.PI / 2;
  arm.position.set(DROP_X, clawY, (-ROOM.halfZ + LANE_Z) / 2);
  scene.add(arm);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8), m.brass);
  hub.position.set(DROP_X, clawY, LANE_Z);
  scene.add(hub);
  const prongs = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(DROP_X, clawY, LANE_Z);
    const prong = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.3, 0.03), m.brass);
    prong.position.set(side * (BALL_RADIUS + 0.02), -0.15, 0);
    pivot.add(prong);
    scene.add(pivot);
    return { pivot, side };
  });

  // --- The deflector: a brass plate tilted 45°, hung from the north wall.
  const d = DEFLECTOR;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(d.halfLength * 2, d.halfThickness * 2, d.halfWidth * 2), m.brass);
  plate.position.set(d.x, d.y, d.z);
  plate.rotation.z = d.angle;
  plate.castShadow = true;
  scene.add(plate);
  const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, Math.abs(-ROOM.halfZ - d.z), 12), m.brass);
  hanger.rotation.x = Math.PI / 2;
  hanger.position.set(d.x, d.y, (-ROOM.halfZ + d.z) / 2);
  scene.add(hanger);

  // --- The skylight: a dim glass panel in the ceiling over the lane (kept dim: see CLAUDE.md on glare).
  const skylightMaterial = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, emissive: 0x8fb0c8, emissiveIntensity: 0.35, roughness: 0.2 });
  const skylight = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), skylightMaterial);
  skylight.rotation.x = Math.PI / 2;
  skylight.position.set(DROP_X + 1, ROOM.height - 0.01, LANE_Z);
  scene.add(skylight);
  const frameBar = (w: number, dd: number, x: number, z: number) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, dd), m.brass);
    bar.position.set(x, ROOM.height - 0.03, z);
    scene.add(bar);
  };
  frameBar(4.1, 0.06, DROP_X + 1, LANE_Z - 1);
  frameBar(4.1, 0.06, DROP_X + 1, LANE_Z + 1);
  frameBar(4.1, 0.04, DROP_X + 1, LANE_Z);
  // A dark hole once it's smashed.
  const hole = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ color: 0x0b0d10 }));
  hole.rotation.x = Math.PI / 2;
  hole.position.copy(skylight.position);
  hole.position.y -= 0.002;
  hole.visible = false;
  scene.add(hole);

  // --- The lever: a brass post with a handle that swings down when pulled.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.0, 16), m.brass);
  post.position.set(LEVER.x, 0.5, LEVER.z);
  post.castShadow = true;
  scene.add(post);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(LEVER.x, 1.0, LEVER.z);
  scene.add(leverPivot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 12), m.brass);
  handle.position.y = 0.25;
  leverPivot.add(handle);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8), new THREE.MeshPhysicalMaterial({ color: 0x7a1d18, roughness: 0.35, clearcoat: 0.6 }));
  knob.position.y = 0.52;
  leverPivot.add(knob);
  leverPivot.rotation.x = -0.5; // held: leaning back

  // --- The entrance placard.
  scene.add(
    placard(
      {
        kicker: "GALLERY V",
        title: "The Bouncing Hall",
        lines: [
          "In this hall a falling ball comes back",
          "faster than it fell. Each bounce is higher.",
          "Pull the lever, read your instrument,",
          "and bring the ball to rest on the balcony.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, 3.9),
      -Math.PI / 2,
      m,
    ),
  );
  // --- Lighting: one shadowed key from the entrance corner, wall washes, and the corridor.
  const key = new THREE.SpotLight(0xfff0dc, 70, 22, Math.PI / 3.2, 0.8, 1.5);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.3, ROOM.halfZ - 0.5);
  key.target.position.set(DROP_X, 2, LANE_Z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const wash = new THREE.PointLight(0xffe2c0, 6, 10, 1.8);
  wash.position.set(BALCONY_EDGE + 1.5, 4.5, 1);
  scene.add(wash);
  const fill = new THREE.PointLight(0xffe2c0, 4, 9, 1.8);
  fill.position.set(ROOM.xMax - 2, 2.6, 3.5);
  scene.add(fill);
  // A low light halfway along the corridor to Gallery VI (drawn here: this gallery is its east end).
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(-88.5, 2.4, 2);
  scene.add(corridorLight);

  let claw = 0;
  let lever = 0;
  return {
    lever: [handle, knob, post],
    update(dt) {
      // The claw opens and the lever swings down once pulled.
      const released = ex.launched ? 1 : 0;
      claw += (released - claw) * Math.min(1, dt * 8);
      for (const p of prongs) p.pivot.rotation.z = p.side * claw * 0.9;
      const pulled = ex.rule("lever").current === "pulled" ? 1 : 0;
      lever += (pulled - lever) * Math.min(1, dt * 10);
      leverPivot.rotation.x = -0.5 + lever * 1.4;
      skylight.visible = !ex.shattered;
      hole.visible = ex.shattered;
    },
  };
}

function buildTrim(scene: THREE.Object3D, m: Materials): void {
  const add = (half: V3, center: V3) => {
    const mesh = new THREE.Mesh(worldBoxGeometry(half, center, 2), m.wallDark);
    mesh.position.set(...center);
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  const cx = (ROOM.xMin + ROOM.xMax) / 2;
  const hx = (ROOM.xMax - ROOM.xMin) / 2;
  const Z = ROOM.halfZ;
  const H = ROOM.height;
  add([hx, 0.09, 0.02], [cx, 0.09, -Z + 0.02]);
  add([hx, 0.09, 0.02], [cx, 0.09, Z - 0.02]);
  add([hx, 0.12, 0.08], [cx, H - 0.12, -Z + 0.08]);
  add([hx, 0.12, 0.08], [cx, H - 0.12, Z - 0.08]);
}
