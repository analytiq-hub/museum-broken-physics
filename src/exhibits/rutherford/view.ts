// View of Rutherford's Gold Foil: a long table with a dark phosphor surface on
// which alpha particles leave glowing green tracks, a sheet of gold foil across
// it, a brass radium source sliding on a rail (click it to move it on), a
// detector ring around its muzzle that flashes on each particle bounced back, and
// three lamps counting them. The atom itself is hidden: only the tracks show it.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { DOOR, FOIL_X, ROOM, SOURCE_X, STATIC_BOXES, TABLE, type RutherfordExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner, over the table. */
  rutherford: { position: [-1.4, 3.6, 3.4] as V3, target: [-6.6, 0.8, 0] as V3 },
  /** Looking down on the table: the tracks. */
  "rutherford-table": { position: [-6.6, 4.25, 3.2] as V3, target: [-6.6, TABLE.y, -0.2] as V3 },
} as const;

export interface RutherfordView {
  update(dt: number): void;
  /** The source's parts (userData.interact set by the gallery). */
  source: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const TRACKS = 14;
/** The phosphor glow texture's width (px). */
const GLOW_W = 640;

export function buildRutherfordView(scene: THREE.Object3D, ex: RutherfordExhibit, m: Materials): RutherfordView {
  // Floor 3: pale stone underfoot, a cooler room.
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

  // --- The phosphor surface on the table: particles paint glowing tracks on it that fade.
  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = GLOW_W;
  glowCanvas.height = Math.round((GLOW_W * (TABLE.z1 - TABLE.z0)) / (TABLE.x1 - TABLE.x0));
  const glow = glowCanvas.getContext("2d")!;
  glow.fillStyle = "#000";
  glow.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
  const glowTexture = new THREE.CanvasTexture(glowCanvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const surface = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.x1 - TABLE.x0, TABLE.z1 - TABLE.z0),
    new THREE.MeshStandardMaterial({ color: 0x0c1410, roughness: 0.9, emissive: 0xffffff, emissiveMap: glowTexture, emissiveIntensity: 1.4 }),
  );
  // Table (x, z) → canvas pixels (the plane lies flat: canvas x along +x, canvas y along +z).
  const toCanvas = (x: number, z: number): [number, number] => [
    ((x - TABLE.x0) / (TABLE.x1 - TABLE.x0)) * glowCanvas.width,
    ((z - TABLE.z0) / (TABLE.z1 - TABLE.z0)) * glowCanvas.height,
  ];
  surface.rotation.x = -Math.PI / 2;
  surface.position.set((TABLE.x0 + TABLE.x1) / 2, TABLE.y + 0.002, 0);
  surface.receiveShadow = true;
  scene.add(surface);

  // --- The gold foil, edge-on across the table in a brass frame.
  const foil = new THREE.Mesh(
    new THREE.PlaneGeometry(TABLE.z1 - TABLE.z0 - 0.2, 0.35),
    new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: 1, roughness: 0.25, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
  );
  foil.rotation.y = Math.PI / 2;
  foil.position.set(FOIL_X, TABLE.y + 0.19, 0);
  scene.add(foil);
  for (const z of [TABLE.z0 + 0.1, TABLE.z1 - 0.1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 10), m.brass);
    post.position.set(FOIL_X, TABLE.y + 0.2, z);
    scene.add(post);
  }

  // --- The rail and the radium source on it.
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, TABLE.z1 - TABLE.z0 - 0.4), m.brass);
  rail.position.set(SOURCE_X + 0.15, TABLE.y + 0.02, 0);
  scene.add(rail);
  const source = new THREE.Group();
  scene.add(source);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.24), new THREE.MeshStandardMaterial({ color: 0x3a3430, metalness: 0.7, roughness: 0.45 }));
  body.position.set(SOURCE_X + 0.15, TABLE.y + 0.13, 0);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 12), m.brass);
  barrel.rotation.z = Math.PI / 2;
  barrel.position.set(SOURCE_X - 0.1, TABLE.y + 0.1, 0);
  const ringMaterial = new THREE.MeshStandardMaterial({ color: 0x8a7030, metalness: 0.8, roughness: 0.3, emissive: 0x000000 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 10, 28), ringMaterial);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(SOURCE_X - 0.24, TABLE.y + 0.1, 0);
  source.add(body, barrel, ring);

  // --- Three lamps on a stand by the source: one per particle bounced back.
  const lampMaterials = [0, 1, 2].map(() => new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x000000 }));
  lampMaterials.forEach((material, i) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), material);
    lamp.position.set(TABLE.x1 + 0.25, TABLE.y + 0.25 + i * 0.14, TABLE.z0 + 0.3);
    scene.add(lamp);
  });

  // --- The particles themselves: small bright beads (their tracks are on the phosphor).
  const heads = Array.from({ length: TRACKS }, () => {
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd8ffe8 }));
    scene.add(head);
    return head;
  });
  /** How many of each particle's track points are already painted, so each frame paints only the rest. */
  const painted = new Map<object, number>();

  scene.add(
    placard(
      {
        kicker: "FLOOR 3 · GALLERY X",
        title: "Rutherford's Gold Foil",
        lines: [
          "Somewhere in this foil is a gold atom.",
          "The particles' tracks are all you can see of it.",
          "Find where its charge is,",
          "and bounce a particle straight back.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: cool and dim, so the tracks glow. A key from the corner, a fill, the corridor.
  const key = new THREE.SpotLight(0xe8f0ff, 30, 18, Math.PI / 3, 0.85, 1.6);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.3, ROOM.halfZ - 0.5);
  key.target.position.set(-6.6, 0.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xd8e4ff, 2.5, 10, 1.8);
  fill.position.set(-6, 3, -3);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let shownHits = 0;
  let flash = 0;
  let sourceZ = ex.sourceZ;
  return {
    source: [body, barrel],
    update(dt) {
      // The source slides along its rail to its position.
      sourceZ += (ex.sourceZ - sourceZ) * Math.min(1, dt * 8);
      source.position.z = sourceZ;
      // The phosphor fades, then each particle paints the stretch it covered since last frame.
      glow.fillStyle = `rgba(0,0,0,${Math.min(0.5, dt * 0.35)})`;
      glow.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
      glow.lineWidth = 3;
      glow.lineCap = "round";
      const tracks = ex.tracks;
      const live = new Set<object>();
      tracks.forEach((track) => {
        const p = track.particle;
        live.add(p);
        // Follow the recorded path (not a straight chord), from the last point painted.
        const start = Math.max(0, (painted.get(p) ?? 0) - 1);
        const path: [number, number][] = [...track.points.slice(start), [p.x, p.z]];
        glow.strokeStyle = p.absorbed ? "#ff7a5a" : "#7dffb0";
        glow.beginPath();
        glow.moveTo(...toCanvas(...path[0]));
        for (const point of path.slice(1)) glow.lineTo(...toCanvas(...point));
        glow.stroke();
        painted.set(p, track.points.length);
      });
      for (const particle of painted.keys()) if (!live.has(particle)) painted.delete(particle);
      glowTexture.needsUpdate = true;
      heads.forEach((head, i) => {
        const p = tracks[tracks.length - 1 - i]?.particle;
        head.visible = !!p?.alive;
        if (p) head.position.set(p.x, TABLE.y + 0.03, p.z);
      });
      // The ring flashes on a hit; the lamps count them.
      if (ex.hits > shownHits) flash = 1;
      shownHits = ex.hits;
      flash = Math.max(0, flash - dt * 2);
      ringMaterial.emissive.setRGB(0.4 * flash, 1.0 * flash, 0.6 * flash);
      ringMaterial.emissiveIntensity = flash > 0 ? 2 : 0;
      lampMaterials.forEach((material, i) => {
        const on = i < ex.hits;
        material.emissive.set(on ? 0x66ff99 : 0x000000);
        material.emissiveIntensity = on ? 2 : 0;
      });
      door.position.y = ex.door.translation().y;
    },
  };
}
