// View of the Hidden Door gallery: a dim marble room where the light beam is
// the star. A brass lamp, two silvered mirrors on stands (they swing to each
// new angle), a glass prism on a pedestal, the beam drawn as a glowing line,
// a hidden door that shows a gold outline once light has fallen on it, its
// brass photocell, and an alcove beyond with the museum's last placard.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import type { Box } from "../layout";
import {
  ALCOVE,
  BEAM_Y,
  DOOR,
  EYE,
  HIDDEN_DOOR,
  LAMP,
  MIRROR_LENGTH,
  MIRRORS,
  PRISM,
  ROOM,
  STATIC_BOXES,
  type OpticsExhibit,
} from "./sim";
import { prism } from "./trace";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** High in the entrance corner, over the whole beam path. */
  optics: { position: [-53.6, 4.1, 4.4] as V3, target: [-59.5, 0.8, -0.8] as V3 },
  /** Facing the hidden door and its photocell. */
  "optics-door": { position: [-58.5, 1.6, 2.2] as V3, target: [-63, 1.3, 1.9] as V3 },
} as const;

export interface OpticsView {
  update(dt: number): void;
  /** Per mirror: its panel first, then frame and stand, for raycasting (userData.interact set by the gallery). */
  mirrors: THREE.Object3D[][];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const BEAM_COLOR = 0xfff1c8;

export function buildOpticsView(scene: THREE.Object3D, ex: OpticsExhibit, sync: BodySync, m: Materials): OpticsView {
  const byKind: Record<Box["kind"], THREE.Material> = {
    floor: m.floor,
    ceiling: m.ceiling,
    wall: m.wall,
    glass: m.glass,
    ledge: m.ledge,
    pedestal: m.wood,
  };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor34-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal";
    scene.add(mesh);
  }
  buildTrim(scene, m);

  // --- The lamp: a brass housing on a stand, its lens glowing.
  const lamp = new THREE.Group();
  lamp.position.set(LAMP.position.x, BEAM_Y, LAMP.position.z);
  scene.add(lamp);
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.45, 24), m.brass);
  housing.rotation.z = Math.PI / 2; // along x, lens facing −x
  lamp.add(housing);
  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.11, 24),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: BEAM_COLOR, emissiveIntensity: 3 }),
  );
  lens.rotation.y = -Math.PI / 2;
  lens.position.x = -0.23;
  lamp.add(lens);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, BEAM_Y, 16), m.brass);
  stand.position.y = -BEAM_Y / 2;
  lamp.add(stand);

  // --- Mirrors: silvered panels on brass stands; each swings toward its rule's angle.
  const silver = new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 1, roughness: 0.04 });
  const mirrors = (Object.entries(MIRRORS) as [keyof typeof MIRRORS, (typeof MIRRORS)[keyof typeof MIRRORS]][]).map(([id, def]) => {
    const group = new THREE.Group();
    group.position.set(def.position.x, BEAM_Y, def.position.z);
    scene.add(group);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(MIRROR_LENGTH, 0.7, 0.03), silver);
    panel.castShadow = true;
    group.add(panel);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(MIRROR_LENGTH + 0.06, 0.76, 0.02), m.brass);
    frame.position.z = -0.015;
    group.add(frame);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, BEAM_Y - 0.35), m.brass);
    pole.position.set(def.position.x, (BEAM_Y - 0.35) / 2, def.position.z);
    scene.add(pole);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.05, 32), m.brass);
    base.position.set(def.position.x, 0.025, def.position.z);
    scene.add(base);
    const angle = () => ((ex.rule(id).current as number) * Math.PI) / 180;
    group.rotation.y = -angle();
    return { id, group, panel, parts: [panel, frame, pole], angle };
  });

  // --- The prism: an extruded glass triangle on its pedestal.
  const tri = prism("glass", { x: 0, z: 0 }, PRISM.side, PRISM.rotation, 1).points;
  const shape = new THREE.Shape(tri.map((p) => new THREE.Vector2(p.x, -p.z)));
  const prismGeometry = new THREE.ExtrudeGeometry(shape, { depth: 0.7, bevelEnabled: false });
  prismGeometry.rotateX(-Math.PI / 2); // extrude upward; shape (x, −z) → world (x, z)
  const prismMesh = new THREE.Mesh(
    prismGeometry,
    new THREE.MeshPhysicalMaterial({ color: 0xcfeff0, roughness: 0.02, transmission: 0.85, thickness: 1, ior: 1.5, transparent: true, opacity: 0.6 }),
  );
  prismMesh.position.set(PRISM.center.x, BEAM_Y - 0.35, PRISM.center.z);
  scene.add(prismMesh);

  // --- The hidden door (in the wall's own marble), its revealed outline, and the photocell.
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);
  sync.bind(ex.door, door);
  const outlineMaterial = new THREE.MeshBasicMaterial({ color: 0xe9c46a, transparent: true, opacity: 0 });
  const x = ROOM.xMin + 0.005;
  const zc = (HIDDEN_DOOR.z0 + HIDDEN_DOOR.z1) / 2;
  const width = HIDDEN_DOOR.z1 - HIDDEN_DOOR.z0;
  for (const [w, h, y, z] of [
    [0.03, HIDDEN_DOOR.height, HIDDEN_DOOR.height / 2, HIDDEN_DOOR.z0],
    [0.03, HIDDEN_DOOR.height, HIDDEN_DOOR.height / 2, HIDDEN_DOOR.z1],
    [width, 0.03, HIDDEN_DOOR.height, zc],
  ]) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(w, h), outlineMaterial);
    line.rotation.y = Math.PI / 2;
    line.position.set(x, y, z);
    scene.add(line);
  }
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x000000, roughness: 0.1 });
  const eye = new THREE.Mesh(new THREE.CircleGeometry(EYE.halfWidth * 0.8, 24), eyeMaterial);
  eye.rotation.y = Math.PI / 2;
  eye.position.set(ROOM.xMin + 0.02, BEAM_Y, EYE.z);
  scene.add(eye);
  const eyeRing = new THREE.Mesh(new THREE.RingGeometry(EYE.halfWidth * 0.8, EYE.halfWidth * 1.2, 24), m.brass);
  eyeRing.rotation.y = Math.PI / 2;
  eyeRing.position.set(ROOM.xMin + 0.021, BEAM_Y, EYE.z);
  scene.add(eyeRing);
  // The eye rides on the door, so it sinks with it.
  const eyeOffset = BEAM_Y - DOOR.center[1];

  // --- Placards: at the entrance, and the last one in the alcove.
  scene.add(
    placard(
      {
        kicker: "GALLERY IV",
        title: "The Hidden Door",
        lines: [
          "Light has forgotten how to bend in this room.",
          "Where it falls, it shows what should be hidden.",
          "Read your instrument, turn the mirrors,",
          "and bring the light to the brass eye.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, 4.3),
      -Math.PI / 2,
      m,
    ),
  );
  scene.add(
    placard(
      {
        kicker: "THE END, FOR NOW",
        title: "More Galleries Ahead",
        lines: [
          "You have put right gravity, damping and light.",
          "The museum's other wings are still being restored.",
          "Thank you for visiting the",
          "Museum of Broken Physics.",
        ],
      },
      new THREE.Vector3(ALCOVE.xMin + 0.04, 1.4, zc),
      Math.PI / 2,
      m,
    ),
  );

  // --- The beam: glowing cylinders between path points, and a glow where it lands.
  const beamMaterial = new THREE.MeshBasicMaterial({ color: BEAM_COLOR, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const beamGroup = new THREE.Group();
  scene.add(beamGroup);
  const spot = new THREE.PointLight(BEAM_COLOR, 2.5, 2.5, 2);
  scene.add(spot);
  const splash = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 8), beamMaterial);
  scene.add(splash);
  let beamKey = "";
  const up = new THREE.Vector3(0, 1, 0);
  const rebuildBeam = () => {
    const beam = ex.beam();
    const key = beam.path.map((p) => `${p.x.toFixed(3)},${p.z.toFixed(3)}`).join(";");
    if (key === beamKey) return;
    beamKey = key;
    for (const child of beamGroup.children) (child as THREE.Mesh).geometry.dispose();
    beamGroup.clear();
    for (let i = 0; i + 1 < beam.path.length; i++) {
      const a = new THREE.Vector3(beam.path[i].x, BEAM_Y, beam.path[i].z);
      const b = new THREE.Vector3(beam.path[i + 1].x, BEAM_Y, beam.path[i + 1].z);
      const length = a.distanceTo(b);
      const segment = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, length, 8, 1, true), beamMaterial);
      segment.position.copy(a).add(b).multiplyScalar(0.5);
      segment.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
      beamGroup.add(segment);
    }
    const end = beam.path.at(-1)!;
    splash.position.set(end.x, BEAM_Y, end.z);
    // Light the splash from just in front of the surface it hit (toward the room's centre).
    const cx = (ROOM.xMin + ROOM.xMax) / 2;
    spot.position.set(end.x + 0.15 * Math.sign(cx - end.x), BEAM_Y, end.z - 0.15 * Math.sign(end.z));
  };

  // --- Lighting: dim, so the beam stands out. One soft corner key (the shadow map), two low sconces.
  const key = new THREE.SpotLight(0xfff0dc, 45, 18, Math.PI / 3, 0.9, 1.6);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.2, -ROOM.halfZ + 0.5);
  key.target.position.set(-59, 0.5, 1);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xffe2c0, 4, 9, 1.8);
  fill.position.set(-55, 3, 3.5);
  scene.add(fill);
  const alcoveLight = new THREE.PointLight(0xffe2c0, 3, 4, 2);
  alcoveLight.position.set((ALCOVE.xMin + ALCOVE.xMax) / 2, 2.1, zc);
  scene.add(alcoveLight);

  let reveal = 0;
  return {
    mirrors: mirrors.map((mm) => mm.parts),
    update(dt) {
      // Mirrors swing toward their angles.
      for (const mm of mirrors) {
        const target = -mm.angle();
        let diff = target - mm.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        mm.group.rotation.y += diff * Math.min(1, dt * 10);
      }
      rebuildBeam();
      // Once the door has sunk, the photocell has gone with it: no splash in mid-air.
      splash.visible = spot.visible = !ex.isSolved();
      // The door's outline fades in once revealed; the photocell glows when lit.
      reveal = Math.min(1, reveal + (ex.revealed ? dt * 0.8 : -1));
      outlineMaterial.opacity = Math.max(0, reveal) * 0.85 * (ex.isSolved() ? 0 : 1);
      eyeMaterial.emissive.set(ex.lit ? 0x66ff99 : 0x000000);
      eyeMaterial.emissiveIntensity = ex.lit ? 2 : 0;
      eye.position.y = door.position.y + eyeOffset;
      eyeRing.position.y = eye.position.y;
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

function placard(text: { kicker: string; title: string; lines: string[] }, at: THREE.Vector3, rotationY: number, m: Materials): THREE.Mesh {
  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#efe6d4";
  ctx.fillRect(0, 0, 560, 400);
  ctx.strokeStyle = "#8a6a2c";
  ctx.lineWidth = 6;
  ctx.strokeRect(14, 14, 532, 372);
  ctx.fillStyle = "#3a2a14";
  ctx.textAlign = "center";
  ctx.font = "600 22px Georgia, serif";
  ctx.letterSpacing = "4px";
  ctx.fillText(text.kicker, 280, 70);
  ctx.letterSpacing = "0px";
  ctx.font = "700 38px Georgia, serif";
  ctx.fillText(text.title, 280, 120);
  ctx.font = "italic 21px Georgia, serif";
  text.lines.forEach((line, i) => ctx.fillText(line, 280, 190 + i * 38));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  const face = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.02), [m.wood, m.wood, m.wood, m.wood, face, m.wood]);
  mesh.position.copy(at);
  mesh.rotation.y = rotationY;
  return mesh;
}
