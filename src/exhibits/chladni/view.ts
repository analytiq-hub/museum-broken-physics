// View of the Chladni Plates: a brass plate on a pedestal, its sand settling on the
// nodal lines of whatever the plate is ringing, the oscillator's five keys, and the
// lock beside the exit door, engraved with the figure it wants. The sand is real:
// each grain takes random kicks as large as the plate's vibration under it, so the
// figure forms out of the noise (and dissolves when the note changes).
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { MODES, modeShape } from "./plate";
import { CONSOLE, DOOR, NOTES, PLATE, ROOM, STATIC_BOXES, TARGET, type ChladniExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance: plate, console and the lock by the door. */
  chladni: { position: [-1.2, 3.0, 3.2] as V3, target: [-6.5, 0.9, -0.8] as V3 },
  /** Looking down at the plate. */
  "chladni-plate": { position: [PLATE.x, PLATE.y + 1.5, PLATE.z + 0.45] as V3, target: [PLATE.x, PLATE.y, PLATE.z - 0.05] as V3 },
} as const;

export interface ChladniView {
  update(dt: number): void;
  keys: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const GRAINS = 9000;
/** Resolution of the sand's density texture. */
const SAND_RES = 160;
/** Resolution of the vibration field the sand reads. */
const G = 48;

export function buildChladniView(scene: THREE.Object3D, ex: ChladniExhibit, m: Materials): ChladniView {
  const byKind: Record<Box["kind"], THREE.Material> = { floor: m.wood, ceiling: m.ceiling, wall: m.wall, glass: m.glass, ledge: m.ledge, pedestal: m.wood };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal";
    scene.add(mesh);
  }

  // --- The exit door (sinks when the lock opens).
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);

  // --- The plate and the oscillator's rod under it.
  // Dark satin bronze, not polished brass: pale sand shows on it, and it doesn't throw the key light back.
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x4a3418, metalness: 0.6, roughness: 0.6 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE.half * 2, 0.02, PLATE.half * 2), plateMaterial);
  plate.position.set(PLATE.x, PLATE.y - 0.01, PLATE.z);
  plate.castShadow = true;
  plate.receiveShadow = true;
  scene.add(plate);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.1, 12), m.brass);
  rod.position.set(PLATE.x, PLATE.y - 0.07, PLATE.z);
  scene.add(rod);

  // --- Sand: grains on the plate, in plate coordinates u, v in 0..1.
  const shapes = MODES.map((mode) => {
    const f = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) f[j * G + i] = modeShape(mode, (i + 0.5) / G, (j + 0.5) / G);
    return f;
  });
  const field = new Float32Array(G * G);
  let seed = 9;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const u = new Float32Array(GRAINS);
  const v = new Float32Array(GRAINS);
  for (let i = 0; i < GRAINS; i++) {
    u[i] = rand();
    v[i] = rand();
  }
  // The sand is drawn as density on a texture lying on the plate: crowded grains show, lone ones barely.
  const sandCanvas = document.createElement("canvas");
  sandCanvas.width = sandCanvas.height = SAND_RES;
  const sandCtx = sandCanvas.getContext("2d")!;
  const sandImage = sandCtx.createImageData(SAND_RES, SAND_RES);
  const counts = new Uint16Array(SAND_RES * SAND_RES);
  const sandTexture = new THREE.CanvasTexture(sandCanvas);
  sandTexture.colorSpace = THREE.SRGBColorSpace;
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATE.half * 2, PLATE.half * 2),
    new THREE.MeshStandardMaterial({ map: sandTexture, transparent: true, roughness: 0.95, depthWrite: false }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(PLATE.x, PLATE.y + 0.003, PLATE.z);
  sand.receiveShadow = true;
  scene.add(sand);
  const sample = (x: number, y: number) => {
    const i = Math.min(G - 1, Math.max(0, (x * G) | 0));
    const j = Math.min(G - 1, Math.max(0, (y * G) | 0));
    return field[j * G + i];
  };

  // --- The console's five keys.
  const keyMaterials: THREE.MeshPhysicalMaterial[] = [];
  const keys = NOTES.map((_, i) => {
    const material = m.brass.clone();
    keyMaterials.push(material);
    const key = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.05, 0.16), material);
    key.position.set(CONSOLE.x + (i - 2) * 0.18, 0.925, CONSOLE.z - 0.02);
    key.castShadow = true;
    scene.add(key);
    return key;
  });
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.8 }));
  cable.position.set(CONSOLE.x + 0.4, 0.5, (CONSOLE.z + PLATE.z) / 2);
  cable.rotation.x = Math.PI / 2;
  scene.add(cable);

  // --- The lock: a brass plaque beside the door, engraved with the figure it wants, and a lamp that fills as it listens.
  const lockTexture = engravedFigure();
  const lock = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshStandardMaterial({ map: lockTexture, metalness: 0.6, roughness: 0.4 }));
  lock.rotation.y = Math.PI / 2;
  lock.position.set(ROOM.xMin + 0.02, 1.6, DOOR.center[2] - 1.5);
  scene.add(lock);
  const lockLampMaterial = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x000000 });
  const lockLamp = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), lockLampMaterial);
  lockLamp.rotation.y = Math.PI / 2;
  lockLamp.position.set(ROOM.xMin + 0.021, 1.2, DOOR.center[2] - 1.5);
  scene.add(lockLamp);

  // --- A crack across the plate when it is strained too far.
  const crackMaterial = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, opacity: 0, depthWrite: false });
  const crack = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.half * 2, PLATE.half * 2), crackMaterial);
  crack.rotation.x = -Math.PI / 2;
  crack.position.set(PLATE.x, PLATE.y + 0.002, PLATE.z);
  scene.add(crack);

  scene.add(
    placard(
      {
        kicker: "FLOOR 2 · GALLERY VII",
        title: "The Chladni Plates",
        lines: [
          "Sand on a ringing plate settles where it is still,",
          "and every note draws its own figure.",
          "The lock on the door is engraved with one.",
          "Make the sand draw it, and mind the plate.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: a shadowed key over the plate (raking light shows the sand), washes, the lock.
  const key = new THREE.SpotLight(0xfff0dc, 50, 14, Math.PI / 4.5, 0.6, 1.5);
  key.position.set(PLATE.x + 2.2, 3.8, PLATE.z + 2.2);
  key.target.position.set(PLATE.x, PLATE.y, PLATE.z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xffe2c0, 3.5, 9, 1.8);
  fill.position.set(ROOM.xMax - 2, 2.6, 2.5);
  scene.add(fill);
  const lockLight = new THREE.PointLight(0xffe2c0, 2.5, 4, 2);
  lockLight.position.set(ROOM.xMin + 1.2, 2.4, DOOR.center[2] - 1.5);
  scene.add(lockLight);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  return {
    keys,
    update(dt) {
      // Mix the field from the modes' current responses.
      const w = ex.weights();
      field.fill(0);
      let max = 1e-6;
      w.forEach((weight, k) => {
        if (weight < 0.01) return;
        const s = shapes[k];
        for (let i = 0; i < G * G; i++) field[i] += weight * s[i];
      });
      const strength = Math.max(...w);
      for (let i = 0; i < G * G; i++) {
        field[i] = Math.abs(field[i]);
        if (field[i] > max) max = field[i];
      }
      // Kick each grain by the vibration under it: nodes are where the kicks vanish.
      // One kick per 60th of a second that passed, so slow machines form figures as fast.
      const kick = 0.05 * strength;
      const slide = 0.008 * strength;
      const e = 1 / G;
      const kicks = kick > 0 ? Math.min(12, Math.max(1, Math.round(dt * 60))) : 0;
      for (let i = 0; i < GRAINS; i++) {
        for (let n = 0; n < kicks; n++) {
          // A random kick as large as the vibration here, and a gentle slide down its slope.
          const a = sample(u[i], v[i]) / max;
          const gx = (sample(u[i] + e, v[i]) - sample(u[i] - e, v[i])) / max;
          const gy = (sample(u[i], v[i] + e) - sample(u[i], v[i] - e)) / max;
          u[i] = Math.min(1, Math.max(0, u[i] + (rand() - 0.5) * kick * a - gx * slide));
          v[i] = Math.min(1, Math.max(0, v[i] + (rand() - 0.5) * kick * a - gy * slide));
        }
      }
      counts.fill(0);
      for (let i = 0; i < GRAINS; i++) counts[Math.min(SAND_RES - 1, (v[i] * SAND_RES) | 0) * SAND_RES + Math.min(SAND_RES - 1, (u[i] * SAND_RES) | 0)]++;
      for (let p = 0, o = 0; p < counts.length; p++, o += 4) {
        sandImage.data[o] = 236;
        sandImage.data[o + 1] = 227;
        sandImage.data[o + 2] = 204;
        sandImage.data[o + 3] = 255 * (1 - Math.exp(-counts[p] * 0.9));
      }
      sandCtx.putImageData(sandImage, 0, 0);
      sandTexture.needsUpdate = true;
      // Keys glow while held; the lock's lamp fills as it listens; the door sinks.
      keyMaterials.forEach((mat, i) => {
        mat.emissive.set(i === ex.sounding ? 0x6a4a10 : 0x000000);
        mat.emissiveIntensity = i === ex.sounding ? 0.7 : 0;
      });
      const p = ex.lockProgress;
      lockLampMaterial.emissive.setRGB(0.2 * p, 1.0 * p, 0.45 * p);
      lockLampMaterial.emissiveIntensity = p > 0 ? 1.5 : 0;
      door.position.y = ex.door.translation().y;
      crackMaterial.opacity = ex.plateBroken ? 1 : ex.cracked ? 0.75 : 0;
      sand.visible = !ex.plateBroken;
    },
  };
}

/** The lock's figure, engraved: dark nodal lines of mode TARGET on brass. */
function engravedFigure(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  const mode = MODES[TARGET];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = Math.abs(modeShape(mode, (x + 0.5) / size, (y + 0.5) / size));
      const line = a < 0.09 ? 1 : 0;
      const border = x < 10 || y < 10 || x > size - 11 || y > size - 11 ? 1 : 0;
      const o = (y * size + x) * 4;
      const dark = Math.max(line, border);
      image.data[o] = 196 - dark * 150;
      image.data[o + 1] = 158 - dark * 120;
      image.data[o + 2] = 84 - dark * 70;
      image.data[o + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function crackTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(20,12,4,0.95)";
  ctx.lineWidth = 2.2;
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 5; i++) {
    let x = 128;
    let y = 128;
    let angle = (i / 5) * Math.PI * 2 + rand() * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 9; j++) {
      angle += (rand() - 0.5) * 0.8;
      x += Math.cos(angle) * 15;
      y += Math.sin(angle) * 15;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
