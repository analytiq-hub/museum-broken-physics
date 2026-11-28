// View of Stern–Gerlach: an optical-style bench with a brass oven (its wheel turns
// it on), a pair of slits, a dark iron magnet with a pointed upper pole, and a
// glass screen where silver builds up where the atoms land. Atoms stream along the
// beam as bright beads, bending in the magnet by their spin. On the screen, two
// brass detectors and, between them, a fragile glass cell that glows as it heats.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { AXIS_Z, BEAM_Y, BENCH_TOP, CELL_HALF, DOOR, MAGNET, MIDDLE_HALF, OVEN_SWITCH, OVEN_X, ROOM, SCREEN_X, SPLIT, STATIC_BOXES, type Spin, type SternGerlachExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner along the bench. */
  "stern-gerlach": { position: [-1.0, 2.8, 2.4] as V3, target: [-7.5, 1.1, -1.6] as V3 },
  /** Facing the screen. */
  "stern-gerlach-screen": { position: [SCREEN_X + 2.2, 1.45, AXIS_Z + 0.9] as V3, target: [SCREEN_X, BEAM_Y, AXIS_Z] as V3 },
} as const;

export interface SternGerlachView {
  update(dt: number): void;
  /** The oven's wheel and body (userData.interact set by the gallery). */
  oven: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const ATOMS = 70;
/** Screen panel size (m): width along z, height along y. */
const SCREEN = { w: 0.9, h: 0.9 } as const;

/** The colour of `amount` of silver on the screen. */
const silver = (amount: number) => `rgba(220,226,232,${Math.min(0.95, amount)})`;
/** A detector's lamp: green once it is getting its share of the beam. */
const lit = (share: number) => (share >= 0.3 ? 0x66ff99 : 0x000000);

/** Vertical displacement (as a share of SPLIT) of an atom at x: bent in the magnet, straight after it. */
function deflection(x: number): number {
  const L = MAGNET.x0 - MAGNET.x1;
  const D = MAGNET.x1 - SCREEN_X;
  const a = 1 / (L * L / 2 + L * D);
  const u = Math.min(L, Math.max(0, MAGNET.x0 - x));
  const drift = Math.max(0, MAGNET.x1 - x);
  return (a * u * u) / 2 + a * L * drift;
}

export function buildSternGerlachView(scene: THREE.Object3D, ex: SternGerlachExhibit, m: Materials): SternGerlachView {
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
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, metalness: 0.8, roughness: 0.45 });

  // --- The oven: a brass drum on legs, glowing at its mouth when hot; a wheel on its side.
  const ovenMaterial = m.brass.clone();
  const oven = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 20), ovenMaterial);
  oven.rotation.z = Math.PI / 2;
  oven.position.set(OVEN_X, BEAM_Y, AXIS_Z);
  scene.add(oven);
  const mouthMaterial = new THREE.MeshStandardMaterial({ color: 0x110a06, emissive: 0x000000 });
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), mouthMaterial);
  mouth.rotation.y = -Math.PI / 2;
  mouth.position.set(OVEN_X - 0.23, BEAM_Y, AXIS_Z);
  scene.add(mouth);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 24), m.brass);
  wheel.position.set(OVEN_SWITCH.x, BEAM_Y, OVEN_SWITCH.z - 0.32);
  scene.add(wheel);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), m.brass);
  axle.rotation.x = Math.PI / 2;
  axle.position.set(OVEN_SWITCH.x, BEAM_Y, AXIS_Z + 0.32);
  scene.add(axle);

  // --- Two slits narrowing the beam.
  for (const x of [OVEN_X - 0.6, OVEN_X - 1.2]) {
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.4, 0.4), iron);
    slit.position.set(x, BEAM_Y, AXIS_Z);
    scene.add(slit);
  }

  // --- The magnet: a pointed upper pole over a grooved lower one, with brass coils.
  const length = MAGNET.x0 - MAGNET.x1;
  const mx = (MAGNET.x0 + MAGNET.x1) / 2;
  const upperGroup = new THREE.Group();
  const upperBar = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, 0.5), iron);
  upperBar.position.set(mx, BEAM_Y + 0.45, AXIS_Z);
  upperGroup.add(upperBar);
  const wedge = new THREE.Mesh(new THREE.BoxGeometry(length, 0.16, 0.08), iron);
  wedge.position.set(mx, BEAM_Y + 0.24, AXIS_Z);
  upperGroup.add(wedge);
  scene.add(upperGroup);
  const lowerBar = new THREE.Mesh(new THREE.BoxGeometry(length, 0.3, 0.5), iron);
  lowerBar.position.set(mx, BEAM_Y - 0.35, AXIS_Z);
  scene.add(lowerBar);
  for (const dx of [-length / 3, 0, length / 3]) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.05, 10, 24), m.brass);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(mx + dx, BEAM_Y + 0.45, AXIS_Z);
    scene.add(coil);
  }

  // --- The screen: glass, with silver building up where the atoms land.
  const depositCanvas = document.createElement("canvas");
  depositCanvas.width = 128;
  depositCanvas.height = 128;
  const deposit = depositCanvas.getContext("2d")!;
  const depositTexture = new THREE.CanvasTexture(depositCanvas);
  depositTexture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN.w, SCREEN.h), new THREE.MeshStandardMaterial({ map: depositTexture, roughness: 0.2, metalness: 0.3 }));
  screen.rotation.y = Math.PI / 2;
  screen.position.set(SCREEN_X + 0.01, BEAM_Y, AXIS_Z);
  scene.add(screen);
  const screenFrame = new THREE.Mesh(new THREE.BoxGeometry(0.04, SCREEN.h + 0.08, SCREEN.w + 0.08), m.brass);
  screenFrame.position.set(SCREEN_X - 0.02, BEAM_Y, AXIS_Z);
  scene.add(screenFrame);
  const standHeight = BEAM_Y - SCREEN.h / 2 - 0.04 - BENCH_TOP;
  const screenStand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, standHeight, 10), m.brass);
  screenStand.position.set(SCREEN_X - 0.02, BENCH_TOP + standHeight / 2, AXIS_Z);
  scene.add(screenStand);
  let drawnExposure = "";
  const drawDeposit = () => {
    const e = ex.exposure;
    const key = `${e.any.toFixed(1)}/${e.two.toFixed(1)}/${e.three.toFixed(1)}`;
    if (key === drawnExposure) return;
    drawnExposure = key;
    const W = depositCanvas.width;
    const H = depositCanvas.height;
    deposit.fillStyle = "#1b2024";
    deposit.fillRect(0, 0, W, H);
    const yToPx = (y: number) => H / 2 - (y / SCREEN.h) * H;
    // Smear: a band from −SPLIT to +SPLIT.
    if (e.any > 0) {
      deposit.fillStyle = silver(e.any / 8);
      deposit.fillRect(W / 2 - 8, yToPx(SPLIT), 16, yToPx(-SPLIT) - yToPx(SPLIT));
    }
    const spots = (ys: number[], amount: number) => {
      deposit.fillStyle = silver(amount);
      for (const y of ys) {
        deposit.beginPath();
        deposit.ellipse(W / 2, yToPx(y), 9, 6, 0, 0, Math.PI * 2);
        deposit.fill();
      }
    };
    if (e.two > 0) spots([-SPLIT, SPLIT], e.two / 2.5);
    if (e.three > 0) spots([-SPLIT, 0, SPLIT], e.three / 2.5);
    depositTexture.needsUpdate = true;
  };

  // --- Cells on the screen: brass detectors at ±SPLIT with lamps, a glass cell between.
  const lampFor = (y: number) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(CELL_HALF, CELL_HALF + 0.025, 20), m.brass);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(SCREEN_X + 0.02, BEAM_Y + y, AXIS_Z);
    scene.add(ring);
    const material = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x000000 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), material);
    lamp.position.set(SCREEN_X + 0.03, BEAM_Y + y, AXIS_Z + SCREEN.w / 2 + 0.1);
    scene.add(lamp);
    return material;
  };
  const upLamp = lampFor(SPLIT);
  const downLamp = lampFor(-SPLIT);
  const middleMaterial = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.6, emissive: 0x000000 });
  const middle = new THREE.Mesh(new THREE.BoxGeometry(0.03, MIDDLE_HALF * 2, MIDDLE_HALF * 2), middleMaterial);
  middle.position.set(SCREEN_X + 0.03, BEAM_Y, AXIS_Z);
  scene.add(middle);

  // --- Atoms streaming along the beam: bright beads, each with its own spin.
  const atomGeometry = new THREE.SphereGeometry(0.012, 6, 4);
  const atomMaterial = new THREE.MeshBasicMaterial({ color: 0xe8f0ff });
  const atoms = new THREE.InstancedMesh(atomGeometry, atomMaterial, ATOMS);
  // The instances move every frame, but three.js computes an InstancedMesh's bounding
  // sphere once (from the first frame's instances) and culls against it forever after:
  // the beam vanished from most view angles. One draw call; never cull it.
  atoms.frustumCulled = false;
  scene.add(atoms);
  const phase = new Float32Array(ATOMS);
  const spinOf = new Float32Array(ATOMS);
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < ATOMS; i++) phase[i] = i / ATOMS;
  let assigned: Spin | "" = "";
  const assignSpins = (spin: Spin) => {
    for (let i = 0; i < ATOMS; i++) {
      if (spin === "any") spinOf[i] = rand() * 2 - 1;
      else if (spin === "two") spinOf[i] = rand() < 0.5 ? -1 : 1;
      else spinOf[i] = [-1, 0, 1][Math.floor(rand() * 3)];
    }
    assigned = spin;
  };
  const dummy = new THREE.Object3D();
  const start = OVEN_X - 0.25;

  scene.add(
    placard(
      {
        kicker: "FLOOR 3 · GALLERY XI",
        title: "Stern–Gerlach",
        lines: [
          "Silver atoms fly through a magnet",
          "that pushes each one by its spin.",
          "Fill both brass detectors with silver.",
          "Mind the glass between them.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, 1.0 - 1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: cool and dim. A key over the bench, a fill, the corridor.
  const key = new THREE.SpotLight(0xe8f0ff, 30, 16, Math.PI / 3.2, 0.85, 1.6);
  key.position.set(-4, ROOM.height - 0.3, 2.5);
  key.target.position.set(-6.5, 0.8, AXIS_Z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xd8e4ff, 2.5, 9, 1.8);
  fill.position.set(SCREEN_X + 1.5, 2.6, 1.2);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let wheelSpin = 0;
  return {
    oven: [oven, wheel],
    update(dt) {
      const on = ex.ovenOn && !ex.cracked;
      mouthMaterial.emissive.set(on ? 0xff9a40 : 0x000000);
      mouthMaterial.emissiveIntensity = on ? 2 : 0;
      ovenMaterial.emissive.set(on ? 0x3a1a06 : 0x000000);
      wheelSpin += ((on ? Math.PI : 0) - wheelSpin) * Math.min(1, dt * 5);
      wheel.rotation.z = wheelSpin;
      if (assigned !== ex.spin) assignSpins(ex.spin);
      atoms.visible = on;
      if (on) {
        for (let i = 0; i < ATOMS; i++) {
          phase[i] = (phase[i] + dt * 0.45) % 1;
          const x = start + (SCREEN_X - start) * phase[i];
          dummy.position.set(x, BEAM_Y + SPLIT * spinOf[i] * deflection(x), AXIS_Z);
          dummy.updateMatrix();
          atoms.setMatrixAt(i, dummy.matrix);
        }
        atoms.instanceMatrix.needsUpdate = true;
      }
      drawDeposit();
      const c = ex.cells();
      upLamp.emissive.set(lit(c.up));
      upLamp.emissiveIntensity = c.up >= 0.3 ? 2 : 0;
      downLamp.emissive.set(lit(c.down));
      downLamp.emissiveIntensity = c.down >= 0.3 ? 2 : 0;
      middleMaterial.emissive.setRGB(ex.heat, 0.35 * ex.heat * ex.heat, 0);
      middleMaterial.emissiveIntensity = ex.heat > 0.02 ? 1.5 : 0;
      middle.visible = !ex.cracked;
      door.position.y = ex.door.translation().y;
    },
  };
}
