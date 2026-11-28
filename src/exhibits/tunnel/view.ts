// View of the Quantum Tunnel: a long glass case on a bench, split by thin glass
// walls into a well, a brass ring in the floor, and a drain whose glass shaft runs to the floor. Above the well, a brass claw and
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
  /** In front of the drain, its shaft down to the floor in view. */
  "tunnel-drain": { position: [-9.3, 1.4, 1.1] as V3, target: [-9.5, 0.55, CASE.z] as V3 },
} as const;

export interface TunnelView {
  update(dt: number): void;
  /** The lever's parts (userData.interact set by the gallery). */
  lever: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const MARBLE_R = 0.09;
/** The ring inlaid in the case floor: inner and outer radius, and thickness. */
const RING_IN = 0.13;
const RING_OUT = 0.21;
const RING_T = 0.006;
/** Height of the drain tray's floor, where a lost marble comes to rest. */
const TRAY_Y = 0.012;
/** The drain's hole, toward the far end of its compartment: the marble's ghost sits
 *  beside it, and a lost marble is seen rolling to it before it drops. */
const HOLE_X = CASE.drain[0] - 1.5;
/** Radius of the drain's hole and the glass shaft below it. */
const SHAFT_R = 0.13;

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A small brass plaque with an engraved word. */
function plaqueTexture(word: string): THREE.Texture {
  return canvasTexture(256, 80, (ctx) => {
    ctx.fillStyle = "#c9a14a";
    ctx.fillRect(0, 0, 256, 80);
    ctx.strokeStyle = "#3a2a14";
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, 244, 68);
    ctx.fillStyle = "#3a2a14";
    ctx.font = "600 38px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.letterSpacing = "6px";
    ctx.fillText(word, 131, 42);
  });
}

/** The middle of a compartment along the case. */
function centre(c: Compartment): number {
  const [a, b] = CASE[c];
  return (a + b) / 2;
}

export function buildTunnelView(scene: THREE.Object3D, ex: TunnelExhibit, m: Materials): TunnelView {
  const byKind: Record<Box["kind"], THREE.Material> = { floor: m.ledge, ceiling: m.ceiling, wall: m.wall, glass: m.glass, ledge: m.ledge, pedestal: m.wood };
  // The bench is one collider, but it is drawn in two pieces with a gap for the drain's shaft.
  const bench = STATIC_BOXES.find((b) => b.name === "bench")!;
  const gapEast = HOLE_X + SHAFT_R + 0.08;
  const gapWest = HOLE_X - SHAFT_R - 0.08;
  const benchEast = bench.center[0] + bench.half[0];
  const benchWest = bench.center[0] - bench.half[0];
  const benchPieces: Box[] = [
    { ...bench, name: "bench-east", center: [(benchEast + gapEast) / 2, bench.center[1], bench.center[2]], half: [(benchEast - gapEast) / 2, bench.half[1], bench.half[2]] },
    { ...bench, name: "bench-west", center: [(gapWest + benchWest) / 2, bench.center[1], bench.center[2]], half: [(gapWest - benchWest) / 2, bench.half[1], bench.half[2]] },
  ];
  for (const box of [...STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-") && b !== bench), ...benchPieces]) {
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
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.03, CASE.height, CASE.halfZ * 2), new THREE.MeshPhysicalMaterial({ color: 0xcfe8f0, roughness: 0.05, transmission: 0.7, transparent: true, opacity: 0.45, depthWrite: false }));
    wall.position.set(x, CASE.y + CASE.height / 2, CASE.z);
    scene.add(wall);
  }

  // --- The ring: a flat brass band inlaid in the case floor. The marble slides in along
  // the floor and rests on top of it, in plain view.
  const ringProfile = [[RING_IN, 0], [RING_OUT, 0], [RING_OUT, RING_T], [RING_IN, RING_T], [RING_IN, 0]].map(([r, y]) => new THREE.Vector2(r, y));
  const ring = new THREE.Mesh(new THREE.LatheGeometry(ringProfile, 48), m.brass);
  ring.position.set(centre("cup"), CASE.y, CASE.z);
  ring.receiveShadow = true;
  scene.add(ring);

  // --- The drain: a brass-rimmed hole in the case floor over a glass shaft that runs
  // down through a gap in the bench to a tray on the floor, so a lost marble is seen
  // falling all the way down.
  const dx = HOLE_X;
  const rim = new THREE.Mesh(new THREE.RingGeometry(SHAFT_R, SHAFT_R + 0.07, 40), m.brass);
  rim.rotation.x = -Math.PI / 2;
  rim.position.set(dx, CASE.y + 0.003, CASE.z);
  scene.add(rim);
  const tubeMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.85, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R, SHAFT_R, CASE.y, 32, 1, true), tubeMaterial);
  tube.position.set(dx, CASE.y / 2, CASE.z);
  scene.add(tube);
  for (const y of [CASE.y - 0.06, 0.06]) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT_R + 0.012, SHAFT_R + 0.012, 0.04, 32, 1, true), m.brass);
    band.position.set(dx, y, CASE.z);
    scene.add(band);
  }
  const trayProfile = [[0, 0.004], [SHAFT_R + 0.04, 0.004], [SHAFT_R + 0.06, 0.04], [SHAFT_R + 0.05, 0.042], [SHAFT_R + 0.03, 0.012], [0, 0.012]].map(([r, y]) => new THREE.Vector2(r, y));
  const tray = new THREE.Mesh(new THREE.LatheGeometry(trayProfile, 40), m.brass);
  tray.position.set(dx, 0, CASE.z);
  scene.add(tray);

  // --- Engraved brass plaques on the bench front name the three compartments.
  const front = CASE.z + 0.5; // the bench's front face
  for (const c of ["well", "cup", "drain"] as Compartment[]) {
    const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.11), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4, map: plaqueTexture(c === "cup" ? "RING" : c.toUpperCase()) }));
    plaque.position.set(c === "drain" ? HOLE_X + 0.6 : centre(c), CASE.y - 0.17, front + 0.004);
    scene.add(plaque);
  }

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
  marble.renderOrder = 2; // drawn after the glass, so walls and clouds never cut into it
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
          "The door opens for a marble on the ring.",
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
  let marbleY = clawY - 0.02;
  let fallSpeed = 0;
  return {
    lever: [handle, knob, post],
    update(dt) {
      time += dt;
      const p = ex.probabilities;
      // Lost (measured in the drain, or drained away while nobody looked): solid again.
      const lost = ex.released && ex.lost;
      const wave = ex.released && ex.found === null && !lost;
      // Clouds glow with their share of the probability (shimmering while it is a wave).
      for (const { c, material } of clouds) material.opacity = wave ? Math.sqrt(p[c]) * (0.28 + 0.05 * Math.sin(time * 7 + c.length)) : 0;
      // The marble: in the claw, a ghost in the likeliest compartment, or solid where it was found.
      leverAngle += ((ex.released ? 1 : 0) - leverAngle) * Math.min(1, dt * 10);
      leverPivot.rotation.x = -0.5 + leverAngle * 1.4;
      claw.rotation.z = ex.released ? 0.8 : 0;
      const likeliest = (Object.keys(p) as Compartment[]).reduce((a, b) => (p[b] > p[a] ? b : a), "well");
      const where = lost ? "drain" : (ex.found ?? likeliest);
      const targetX = lost ? HOLE_X : centre(where);
      const floorY = CASE.y + MARBLE_R;
      if (!ex.released) {
        // Held in the claw over the well (also straight after a reset).
        marbleX = centre("well");
        marbleY = clawY - 0.02;
        fallSpeed = 0;
      } else if (lost && marbleY > floorY - 0.001 && marbleY < floorY + 0.02 && Math.abs(targetX - marbleX) > 0.01) {
        // Lost: roll along the floor to the hole first...
        marbleX += Math.sign(targetX - marbleX) * Math.min(Math.abs(targetX - marbleX), dt * 1.2);
        marbleY = floorY;
        fallSpeed = 0;
      } else if (lost && Math.abs(targetX - marbleX) <= 0.01) {
        // ...then drop down the shaft to the tray on the floor.
        marbleX = targetX;
        fallSpeed += 9.81 * dt;
        marbleY = Math.max(TRAY_Y + MARBLE_R, marbleY - fallSpeed * dt);
      } else {
        // Dropped from the claw, it falls into the well; on the floor it drifts (as a
        // wave) or slides to where it was found, resting on the ring there.
        const restY = floorY + (where === "cup" ? RING_T : 0);
        if (marbleY > restY + 0.001) {
          fallSpeed += 9.81 * dt;
          marbleY = Math.max(restY, marbleY - fallSpeed * dt);
        } else {
          marbleY = restY;
          fallSpeed = 0;
          marbleX += (targetX - marbleX) * Math.min(1, dt * (wave ? 1.5 : 6));
        }
      }
      marble.position.set(marbleX, marbleY, CASE.z);
      marbleMaterial.opacity = wave ? 0.25 + 0.1 * Math.sin(time * 5) : 1;
      door.position.y = ex.door.translation().y;
    },
  };
}
