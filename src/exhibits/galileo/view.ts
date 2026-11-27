// View of Galileo's Ledge: a tall stone ledge with a brass ball and a cork ball in
// two grooved lanes, a spring kicker behind them and its lever beside the ledge.
// Beyond the edge, two felt-lined brass pans, the cork one farther out, stand on
// columns joined under the floor to a balance dial behind them: its needle points
// up when the pans weigh the same.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { BALL_RADIUS, DOOR, LANES, LEDGE, LEDGE_BOX, PAN, PAN_BOXES, PANS, ROOM, START_X, STATIC_BOXES, type GalileoExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner: the ledge, the pans and the dial. */
  galileo: { position: [-0.9, 2.6, 2.8] as V3, target: [-5.0, 1.1, -1.8] as V3 },
  /** From the side: the balls' flight from the ledge to the pans. */
  "galileo-flight": { position: [-4.9, 1.7, 2.4] as V3, target: [-4.9, 1.15, -1.7] as V3 },
} as const;

export interface GalileoView {
  update(dt: number): void;
  /** The kicker lever's parts (userData.interact set by the gallery). */
  lever: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const LEVER = { x: -3.3, z: -0.7 } as const;
const DIAL = { x: (PANS.brass.x + PANS.cork.x) / 2, y: 1.45, z: -2.75, r: 0.32 } as const;

function drawDial(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#efe6d4";
  c.beginPath();
  c.arc(128, 128, 124, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = "#3a2a14";
  c.fillStyle = "#3a2a14";
  c.lineWidth = 3;
  for (let i = -6; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 3);
    const r0 = i === 0 ? 70 : i % 3 === 0 ? 88 : 100;
    c.beginPath();
    c.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
    c.lineTo(128 + Math.sin(a) * 114, 128 - Math.cos(a) * 114);
    c.stroke();
  }
  c.textAlign = "center";
  c.font = "600 22px Georgia, serif";
  c.fillText("LEVEL", 128, 58);
  c.font = "italic 18px Georgia, serif";
  c.fillText("brass", 58, 150);
  c.fillText("cork", 198, 150);
  c.lineWidth = 6;
  c.strokeStyle = "#8a6a2c";
  c.beginPath();
  c.arc(128, 128, 122, 0, Math.PI * 2);
  c.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function buildGalileoView(scene: THREE.Object3D, ex: GalileoExhibit, sync: BodySync, m: Materials): GalileoView {
  const byKind: Record<Box["kind"], THREE.Material> = { floor: m.ledge, ceiling: m.ceiling, wall: m.wall, glass: m.glass, ledge: m.ledge, pedestal: m.wood };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);
  sync.bind(ex.door, door);

  // --- The ledge: a tall block of wall stone with a polished top and two grooved lanes.
  const ledge = new THREE.Mesh(worldBoxGeometry(LEDGE_BOX.half, LEDGE_BOX.center, TILE.wall), m.wall);
  ledge.position.set(...LEDGE_BOX.center);
  ledge.castShadow = ledge.receiveShadow = true;
  scene.add(ledge);
  const groove = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 0.8 });
  for (const z of [LANES.brass, LANES.cork]) {
    for (const dz of [-0.05, 0.05]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(LEDGE.east - LEDGE.edge, 0.004, 0.012), groove);
      rail.position.set((LEDGE.edge + LEDGE.east) / 2, LEDGE.top + 0.002, z + dz);
      scene.add(rail);
    }
  }
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, LEDGE.halfZ * 2), m.brass);
  lip.position.set(LEDGE.edge + 0.015, LEDGE.top - 0.015, LEDGE.z);
  scene.add(lip);

  // --- The balls: brass, and a cork one the same mass.
  const brass = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 28, 18), m.brass);
  const cork = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 28, 18), new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.95 }));
  for (const ball of [brass, cork]) {
    ball.castShadow = true;
    scene.add(ball);
  }
  sync.bind(ex.brass, brass);
  sync.bind(ex.cork, cork);

  // --- The kicker: a brass bar behind both balls on two springs; it snaps forward when fired.
  const kicker = new THREE.Group();
  const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, Math.abs(LANES.cork - LANES.brass) + 0.3), m.brass);
  kicker.add(bar);
  for (const z of [LANES.brass, LANES.cork]) {
    const spring = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.9, roughness: 0.3, wireframe: true }));
    spring.rotation.z = Math.PI / 2;
    spring.position.set(0.17, 0, z - (LANES.brass + LANES.cork) / 2);
    kicker.add(spring);
  }
  const kickerRestX = START_X + BALL_RADIUS + 0.03;
  kicker.position.set(kickerRestX, LEDGE.top + 0.05, (LANES.brass + LANES.cork) / 2);
  scene.add(kicker);

  // --- The lever beside the ledge.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 14), m.brass);
  post.position.set(LEVER.x, 0.5, LEVER.z);
  scene.add(post);
  const leverPivot = new THREE.Group();
  leverPivot.position.set(LEVER.x, 1.0, LEVER.z);
  scene.add(leverPivot);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), m.brass);
  handle.position.y = 0.22;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x7a2a1a, roughness: 0.35, clearcoat: 0.6 }));
  knob.position.y = 0.47;
  leverPivot.add(handle, knob);

  // --- The pans: brass trays lined with green felt, each on a column.
  const felt = new THREE.MeshStandardMaterial({ color: 0x2f5a3a, roughness: 1 });
  for (const box of PAN_BOXES) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(box.half[0] * 2, box.half[1] * 2, box.half[2] * 2), m.brass);
    mesh.position.set(...box.center);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const pan of [PANS.brass, PANS.cork]) {
    const lining = new THREE.Mesh(new THREE.PlaneGeometry(PAN.half * 2, PAN.half * 2), felt);
    lining.rotation.x = -Math.PI / 2;
    lining.position.set(pan.x, PAN.floor + 0.002, pan.z);
    lining.receiveShadow = true;
    scene.add(lining);
  }
  for (const pan of [PANS.brass, PANS.cork]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, PAN.floor - 0.04, 14), m.brass);
    column.position.set(pan.x, (PAN.floor - 0.04) / 2, pan.z);
    scene.add(column);
  }

  // --- The balance dial behind the pans.
  const dialStand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, DIAL.y, 12), m.brass);
  dialStand.position.set(DIAL.x, DIAL.y / 2, DIAL.z);
  scene.add(dialStand);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(DIAL.r, 48), new THREE.MeshStandardMaterial({ map: drawDial(), roughness: 0.6 }));
  dial.position.set(DIAL.x, DIAL.y, DIAL.z + 0.04);
  scene.add(dial);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(DIAL.r, 0.022, 8, 48), m.brass);
  rim.position.copy(dial.position);
  scene.add(rim);
  const needle = new THREE.Mesh(new THREE.BoxGeometry(0.016, DIAL.r * 0.85, 0.008), new THREE.MeshStandardMaterial({ color: 0x1a1208 }));
  needle.geometry.translate(0, DIAL.r * 0.38, 0);
  needle.position.set(DIAL.x, DIAL.y, DIAL.z + 0.05);
  scene.add(needle);

  scene.add(
    placard(
      {
        kicker: "FLOOR 3 · GALLERY XIV",
        title: "Galileo's Ledge",
        lines: ["Two balls of equal mass, one brass,", "one cork. One kick sends both flying.", "The door opens when each lies in its pan", "and the pans weigh the same."],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: a warm key from the entrance corner, a fill, the corridor.
  const key = new THREE.SpotLight(0xfff0dc, 40, 18, Math.PI / 3.2, 0.8, 1.6);
  key.position.set(-1.5, ROOM.height - 0.3, 2.8);
  key.target.position.set(-5, 0.8, -1.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xe8ecff, 3, 10, 1.6);
  fill.position.set(-8, 2.8, 1.0);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let leverAngle = 0;
  let kick = 0;
  let needleAngle = 0;
  return {
    lever: [handle, knob, post],
    update(dt) {
      const fired = ex.kicked ? 1 : 0;
      leverAngle += (fired - leverAngle) * Math.min(1, dt * 10);
      leverPivot.rotation.x = -0.5 + leverAngle * 1.4;
      kick += (fired - kick) * Math.min(1, dt * 30);
      kicker.position.x = kickerRestX - kick * 0.14;
      // The needle leans toward the heavier pan; an empty balance rests leaning toward brass's side.
      const w = ex.weights();
      const target = w.brass + w.cork === 0 ? -0.15 : Math.max(-1, Math.min(1, (w.cork - w.brass) / Math.max(w.brass, w.cork))) * (Math.PI / 3);
      needleAngle += (target - needleAngle) * Math.min(1, dt * 4);
      needle.rotation.z = -needleAngle;
    },
  };
}
