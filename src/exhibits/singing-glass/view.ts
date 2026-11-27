// View of the Singing Glass: a narrow hall with a small brass organ against the
// north wall, a tall glass pane in the west doorway, an antique glass harmonica
// in a case on the south wall, two decoy glasses on shelves, and the corridor on. Glasses wobble as they ring, show a
// crack at half strength, and leave shards when they break.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { CRACK_AT } from "./resonance";
import { DECOYS, HARMONICA, ORGAN, PANE, PIPE_LENGTHS, ROOM, STATIC_BOXES, type SingingGlassExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner: organ, pane and harmonica. */
  singing: { position: [-93.6, 3.4, 3.0] as V3, target: [-99, 1.1, -1.6] as V3 },
  /** Close on the harmonica's case. */
  "singing-harmonica": { position: [-97.5, 1.6, 1.2] as V3, target: [-97.5, 1.1, 3.2] as V3 },
  /** Facing the pane. */
  "singing-pane": { position: [-99.5, 1.6, 2.0] as V3, target: [-103, 1.4, 2.0] as V3 },
} as const;

export interface SingingGlassView {
  update(dt: number): void;
  /** One mesh per organ pipe, for raycasting (userData.interact set by the gallery). */
  pipes: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
/** Organ pipes are drawn this many times their sounding length, so the organ reads from across the room. */
const PIPE_SCALE = 2.2;

// The pane's body never needs syncing (it only vanishes, which update() shows), so `_sync` goes unused.
export function buildSingingGlassView(scene: THREE.Object3D, ex: SingingGlassExhibit, _sync: BodySync, m: Materials): SingingGlassView {
  const byKind: Record<Box["kind"], THREE.Material> = {
    floor: m.wood, // Floor 2 is floored in wood: a different level, a different look
    ceiling: m.ceiling,
    wall: m.wall,
    glass: m.glass,
    ledge: m.ledge,
    pedestal: m.wood,
  };
  // The gallery to the east draws the corridor in (it is the east end of it).
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal";
    scene.add(mesh);
  }
  buildTrim(scene, m);
  const crack = crackTexture();
  const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.9, thickness: 0.2, transparent: true, opacity: 0.45 });

  // --- The organ: brass pipes on the case, each with a dark mouth. Sounding pipes glow.
  const pipeMaterials: THREE.MeshPhysicalMaterial[] = [];
  const pipes = PIPE_LENGTHS.map((L, i) => {
    const length = L * PIPE_SCALE + 0.3;
    const material = m.brass.clone();
    pipeMaterials.push(material);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, length, 20), material);
    pipe.position.set(ORGAN.x0 + i * ORGAN.spacing, ORGAN.baseY + length / 2, ORGAN.z);
    pipe.castShadow = true;
    scene.add(pipe);
    const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.05), new THREE.MeshBasicMaterial({ color: 0x120c06 }));
    mouth.position.set(pipe.position.x, ORGAN.baseY + 0.18, ORGAN.z + 0.061);
    scene.add(mouth);
    return pipe;
  });
  // A brass label rail along the case's front.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.02), m.brass);
  rail.position.set(ORGAN.x0 + 2 * ORGAN.spacing, ORGAN.baseY - 0.1, ORGAN.z + 0.36);
  scene.add(rail);

  // --- The pane in the west doorway, in a brass frame.
  const [px, py, pz] = PANE.center;
  const pane = new THREE.Mesh(new THREE.BoxGeometry(PANE.half[0] * 2, PANE.half[1] * 2, PANE.half[2] * 2), glassMaterial);
  pane.position.set(px, py, pz);
  scene.add(pane);
  const paneCrack = crackPlane(crack, PANE.half[2] * 2, PANE.half[1] * 2);
  paneCrack.rotation.y = Math.PI / 2;
  paneCrack.position.set(px + 0.04, py, pz);
  scene.add(paneCrack);
  const frame: [number, number, number, number][] = [
    [0.06, 3.0, 1.5, 1.0],
    [0.06, 3.0, 1.5, 3.0],
    [2.0, 0.06, 3.0, 2.0],
  ];
  for (const [w, h, y, z] of frame) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.08, h, w), m.brass);
    bar.position.set(px + 0.02, y, z);
    scene.add(bar);
  }
  const paneShards = shards(new THREE.Vector3(px + 0.6, 0.01, pz), 1.1, 18, glassMaterial);
  scene.add(paneShards);

  // --- The glass harmonica: nested glass bowls on a rod, in a wooden case on the south wall.
  const harmonicaCase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.5), m.wood);
  harmonicaCase.position.set(HARMONICA.x, HARMONICA.y - 0.22, HARMONICA.z - 0.05);
  harmonicaCase.castShadow = true;
  scene.add(harmonicaCase);
  const legs = new THREE.Mesh(new THREE.BoxGeometry(1.2, HARMONICA.y - 0.28, 0.4), m.wood);
  legs.position.set(HARMONICA.x, (HARMONICA.y - 0.28) / 2, HARMONICA.z - 0.05);
  scene.add(legs);
  const harmonica = new THREE.Group();
  harmonica.position.set(HARMONICA.x, HARMONICA.y, HARMONICA.z - 0.05);
  scene.add(harmonica);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.2, 8), m.brass);
  rod.rotation.z = Math.PI / 2;
  harmonica.add(rod);
  for (let i = 0; i < 9; i++) {
    const r = 0.14 - i * 0.011;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glassMaterial);
    bowl.rotation.z = -Math.PI / 2; // open toward +x, nested along the rod
    bowl.position.x = -0.48 + i * 0.11;
    harmonica.add(bowl);
  }
  const harmonicaCrack = crackPlane(crack, 1.0, 0.3);
  harmonicaCrack.rotation.y = Math.PI;
  harmonicaCrack.position.set(HARMONICA.x, HARMONICA.y, HARMONICA.z - 0.21);
  scene.add(harmonicaCrack);
  const harmonicaShards = shards(new THREE.Vector3(HARMONICA.x, HARMONICA.y - 0.15, HARMONICA.z - 0.05), 0.5, 14, glassMaterial);
  scene.add(harmonicaShards);

  // --- Decoy glasses on little wall shelves.
  const decoys = (Object.entries(DECOYS) as [keyof typeof DECOYS, (typeof DECOYS)[keyof typeof DECOYS]][]).map(([id, at]) => {
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), m.wood);
    shelf.position.set(at.x, at.y - 0.02, at.z);
    scene.add(shelf);
    const glass = new THREE.Mesh(id === "decoy-goblet" ? gobletGeometry() : fluteGeometry(), glassMaterial);
    glass.position.set(at.x, at.y, at.z);
    scene.add(glass);
    return { id, glass };
  });

  // --- The entrance placard.
  scene.add(
    placard(
      {
        kicker: "FLOOR 2 · GALLERY VI",
        title: "The Singing Glass",
        lines: [
          "The organ in this hall plays out of tune,",
          "and the glass has been listening.",
          "Every glass has a note it cannot bear.",
          "Find the pane's, and spare the harmonica.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );
  // --- Lighting: one shadowed key, washes on the organ and the harmonica, the alcove.
  const key = new THREE.SpotLight(0xfff0dc, 55, 18, Math.PI / 3, 0.8, 1.5);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.3, ROOM.halfZ - 0.5);
  key.target.position.set(-98.5, 0.8, -0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const organLight = new THREE.PointLight(0xffe2c0, 4, 6, 1.8);
  organLight.position.set(ORGAN.x0 + 2 * ORGAN.spacing, 2.8, -1.2);
  scene.add(organLight);
  const caseLight = new THREE.PointLight(0xffe2c0, 3, 5, 1.8);
  caseLight.position.set(HARMONICA.x, 2.4, 1.4);
  scene.add(caseLight);
  // A low light halfway along the corridor on (this gallery draws it: it is its east end).
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let time = 0;
  return {
    pipes,
    update(dt) {
      time += dt;
      const sounding = ex.sounding;
      pipeMaterials.forEach((mat, i) => {
        mat.emissive.set(i === sounding ? 0x6a4a10 : 0x000000);
        mat.emissiveIntensity = i === sounding ? 0.6 + 0.2 * Math.sin(time * 30) : 0;
      });
      // Glasses wobble with how hard they're ringing; cracks show at half strength.
      const wobble = (amplitude: number, seed: number) => Math.sin(time * 40 + seed) * amplitude * 0.04;
      const p = ex.glass("pane");
      pane.visible = !p.broken;
      paneShards.visible = p.broken;
      pane.rotation.x = wobble(p.amplitude, 0) * 0.3;
      (paneCrack.material as THREE.MeshBasicMaterial).opacity = p.broken ? 0 : crackOpacity(p.amplitude, p.cracked);
      const h = ex.glass("harmonica");
      harmonica.visible = !h.broken;
      harmonicaShards.visible = h.broken;
      harmonica.rotation.x = wobble(h.amplitude, 1) * 2;
      (harmonicaCrack.material as THREE.MeshBasicMaterial).opacity = h.broken ? 0 : crackOpacity(h.amplitude, h.cracked);
      for (const d of decoys) {
        const a = ex.glass(d.id).amplitude;
        d.glass.rotation.z = wobble(a, 2) * 3;
        d.glass.rotation.x = wobble(a, 3) * 3;
      }
    },
  };
}

/** A crack shows from the moment a glass first reaches half strength, a little stronger while it rings. */
function crackOpacity(amplitude: number, cracked: boolean): number {
  if (!cracked && amplitude < CRACK_AT) return 0;
  return Math.min(1, 0.55 + amplitude * 0.45);
}

function crackPlane(texture: THREE.Texture, w: number, h: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, opacity: 0, depthWrite: false }),
  );
}

/** White, jagged crack lines radiating from a point, on a transparent canvas. */
function crackTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 1.6;
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 9; i++) {
    let x = 128;
    let y = 128;
    let angle = (i / 9) * Math.PI * 2 + rand() * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 7; j++) {
      angle += (rand() - 0.5) * 0.9;
      x += Math.cos(angle) * 18;
      y += Math.sin(angle) * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A scatter of flat glass shards around `at`, hidden until something breaks. */
function shards(at: THREE.Vector3, spread: number, count: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  let seed = Math.round(at.x * 100) + count;
  const rand = () => ((seed = (seed * 16807 + 11) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const size = 0.04 + rand() * 0.08;
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(size, rand() * size * 0.4), new THREE.Vector2(rand() * size, size)]);
    const shard = new THREE.Mesh(new THREE.ShapeGeometry(shape), material);
    shard.rotation.set(-Math.PI / 2, 0, rand() * Math.PI * 2);
    shard.position.set(at.x + (rand() - 0.5) * spread, at.y + 0.003, at.z + (rand() - 0.5) * spread);
    group.add(shard);
  }
  group.visible = false;
  return group;
}

function gobletGeometry(): THREE.LatheGeometry {
  const pts = [
    [0.0, 0.0],
    [0.06, 0.0],
    [0.065, 0.01],
    [0.012, 0.02],
    [0.01, 0.12],
    [0.05, 0.16],
    [0.07, 0.22],
    [0.068, 0.28],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 24);
}

function fluteGeometry(): THREE.LatheGeometry {
  const pts = [
    [0.0, 0.0],
    [0.05, 0.0],
    [0.052, 0.01],
    [0.01, 0.02],
    [0.008, 0.13],
    [0.03, 0.17],
    [0.036, 0.26],
    [0.034, 0.34],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 24);
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
