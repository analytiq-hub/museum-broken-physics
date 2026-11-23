// View of the Restless Pendulum gallery: marble room, brass pivot, rod and bob,
// two bells on wall arms that swing when struck, a glass vase on a high bracket
// that shatters, a placard, and side/corner lighting (nothing bright overhead).
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import type { Box } from "../layout";
import {
  BELLS,
  BOB_RADIUS,
  PIVOT,
  ROOM,
  STATIC_BOXES,
  VASE,
  arcPoint,
  type PendulumExhibit,
} from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** High in the entrance corner, looking across the swing. */
  pendulum: { position: [-15.6, 6.8, 5.6] as V3, target: [-20.5, 3.8, -1] as V3 },
  /** Low by the far wall, looking back up at the bob, bells and vase. */
  "pendulum-low": { position: [-24.4, 1.6, 4.5] as V3, target: [-20, 5, -0.5] as V3 },
} as const;

export interface PendulumView {
  update(dt: number): void;
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const DUST_COUNT = 400;

export function buildPendulumView(scene: THREE.Scene, ex: PendulumExhibit, sync: BodySync, m: Materials): PendulumView {
  const byKind: Record<Box["kind"], THREE.Material> = {
    floor: m.floor,
    ceiling: m.ceiling,
    wall: m.wall,
    glass: m.glass,
    ledge: m.ledge,
    pedestal: m.wood,
  };
  // The shared corridor is drawn once, by Gallery I.
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-"))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  buildTrim(scene, m);

  // --- Pivot housing and axle at the ceiling.
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.6), m.wallDark);
  housing.position.set(PIVOT.x, ROOM.height - 0.2, PIVOT.z);
  housing.castShadow = true;
  scene.add(housing);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.1, 24), m.brass);
  axle.rotation.z = Math.PI / 2;
  axle.position.set(PIVOT.x, PIVOT.y, PIVOT.z);
  scene.add(axle);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.16, 24), m.brass);
  hub.rotation.z = Math.PI / 2;
  hub.position.copy(axle.position);
  scene.add(hub);

  // --- Rod and bob. The bob is bound to its body; the rod is re-aimed every frame.
  const bobMaterial = m.brass.clone();
  bobMaterial.color.set(0xb08d57);
  bobMaterial.roughness = 0.35;
  const bob = new THREE.Mesh(new THREE.SphereGeometry(BOB_RADIUS, 48, 24), bobMaterial);
  bob.castShadow = true;
  scene.add(bob);
  sync.bind(ex.bob, bob);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 12), m.brass);
  rod.castShadow = true;
  scene.add(rod);
  const pivot = new THREE.Vector3(PIVOT.x, PIVOT.y, PIVOT.z);

  // --- Bells on arms from the nearest side wall.
  const bells = BELLS.map((b, i) => {
    const p = arcPoint(b.angle);
    const wallZ = Math.sign(p.z) * ROOM.halfZ;
    const group = new THREE.Group(); // pivots at the top of the bell, so it can swing
    group.position.set(p.x, p.y + 0.38, p.z);
    scene.add(group);
    const bellMaterial = m.brass.clone();
    bellMaterial.color.set(i === 0 ? 0xc9a14a : 0xb88a3a);
    const bell = new THREE.Mesh(bellGeometry(0.28 + i * 0.04), bellMaterial);
    bell.position.y = -0.38;
    bell.castShadow = true;
    group.add(bell);
    const armLength = Math.abs(wallZ - p.z);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, armLength, 12), m.wallDark);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(p.x, p.y + 0.4, (p.z + wallZ) / 2);
    scene.add(arm);
    const mount = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.06), m.brass);
    mount.position.set(p.x, p.y + 0.4, wallZ - Math.sign(wallZ) * 0.03);
    scene.add(mount);
    return { name: b.name, group, material: bellMaterial, swing: 0, phase: 0 };
  });

  // --- The vase on a high bracket, and its shards once broken.
  const vp = arcPoint(VASE.angle);
  const vaseWallZ = ROOM.halfZ;
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, vaseWallZ - vp.z + 0.25), m.brass);
  shelf.position.set(vp.x, vp.y - 0.32, (vp.z + vaseWallZ) / 2);
  shelf.castShadow = true;
  scene.add(shelf);
  const vaseMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x9fd0c8,
    roughness: 0.05,
    transmission: 0.6,
    thickness: 0.2,
    transparent: true,
    opacity: 0.75,
  });
  const vase = new THREE.Mesh(vaseGeometry(), vaseMaterial);
  vase.position.set(vp.x, vp.y - 0.3, vp.z);
  scene.add(vase);
  const shards: { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; resting: boolean }[] = [];
  const spawnShards = () => {
    for (let i = 0; i < 18; i++) {
      const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.04 + Math.random() * 0.05), vaseMaterial);
      shard.position.copy(vase.position).add(new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.15, (Math.random() - 0.5) * 0.2));
      scene.add(shard);
      shards.push({
        mesh: shard,
        v: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2, -Math.random() * 3),
        spin: new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10),
        resting: false,
      });
    }
  };
  const clearShards = () => {
    for (const s of shards) scene.remove(s.mesh);
    shards.length = 0;
  };

  // --- Placard just inside the entrance, facing the doorway.
  const placard = new THREE.Mesh(
    new THREE.BoxGeometry(0.02, 0.5, 0.7),
    [new THREE.MeshStandardMaterial({ map: placardTexture(), roughness: 0.7 }), m.wood, m.wood, m.wood, m.wood, m.wood],
  );
  placard.position.set(ROOM.xMax - 0.04, 1.5, 4.3);
  scene.add(placard);

  // --- Dust.
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = ROOM.xMin + Math.random() * (ROOM.xMax - ROOM.xMin);
    dustPositions[i * 3 + 1] = Math.random() * ROOM.height;
    dustPositions[i * 3 + 2] = (Math.random() * 2 - 1) * ROOM.halfZ;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  scene.add(
    new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({ map: softDot(), color: 0xfff0cc, size: 0.05, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }),
    ),
  );

  // --- Lighting: a corner key spot (the room's one shadow map), side washes, sconces.
  const key = new THREE.SpotLight(0xfff3e2, 150, 26, Math.PI / 3.4, 0.9, 1.6);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.2, 5.4);
  key.target.position.set(PIVOT.x, 3.5, -1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  for (const z of [-4.8, 4.8]) {
    const wash = new THREE.PointLight(0xfff1de, 10, 10, 1.6);
    wash.position.set(-22.5, 5.6, z);
    scene.add(wash);
  }
  const bellLight = new THREE.SpotLight(0xfff4e4, 40, 14, Math.PI / 5, 0.6, 1.5);
  bellLight.position.set(ROOM.xMin + 0.5, 7.5, 0);
  bellLight.target.position.set(PIVOT.x, 4.5, 0);
  scene.add(bellLight, bellLight.target);

  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();
  let wasBroken = false;
  return {
    update(dt) {
      // Rod from the pivot to the (interpolated) bob.
      dir.subVectors(bob.position, pivot);
      const length = dir.length();
      rod.scale.set(1, length, 1);
      rod.position.copy(pivot).addScaledVector(dir, 0.5);
      rod.quaternion.setFromUnitVectors(up, dir.normalize());

      // Bells swing (and glint) when struck.
      for (const b of bells) {
        if (ex.rung.includes(b.name) && b.swing === 0 && b.phase === 0) b.swing = 0.5;
        if (!ex.rung.includes(b.name)) {
          b.swing = 0;
          b.phase = 0;
        }
        b.phase += dt * 9;
        b.swing *= Math.exp(-dt * 0.8);
        b.group.rotation.x = Math.sin(b.phase) * b.swing;
        b.material.emissive.setRGB(b.swing * 0.5, b.swing * 0.35, b.swing * 0.1);
      }

      // The vase breaks into falling shards; a reset restores it.
      if (ex.vaseBroken && !wasBroken) {
        vase.visible = false;
        spawnShards();
      }
      if (!ex.vaseBroken && wasBroken) {
        vase.visible = true;
        clearShards();
      }
      wasBroken = ex.vaseBroken;
      for (const s of shards) {
        if (s.resting) continue;
        s.v.y -= 9.81 * dt;
        s.mesh.position.addScaledVector(s.v, dt);
        s.mesh.rotation.x += s.spin.x * dt;
        s.mesh.rotation.y += s.spin.y * dt;
        if (s.mesh.position.y < 0.03) {
          s.mesh.position.y = 0.03;
          s.resting = true;
        }
      }

      // Dust settles slowly.
      const p = dustGeometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < DUST_COUNT; i++) {
        let y = p.array[i * 3 + 1] - 0.08 * dt + (Math.random() - 0.5) * 0.004;
        if (y < 0) y = ROOM.height;
        p.array[i * 3 + 1] = y;
      }
      p.needsUpdate = true;
    },
  };
}

function buildTrim(scene: THREE.Scene, m: Materials): void {
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
  add([0.02, 0.09, Z], [ROOM.xMin + 0.02, 0.09, 0]);
  add([hx, 0.14, 0.09], [cx, H - 0.14, -Z + 0.09]);
  add([hx, 0.14, 0.09], [cx, H - 0.14, Z - 0.09]);
  add([0.09, 0.14, Z], [ROOM.xMin + 0.09, H - 0.14, 0]);
  add([0.09, 0.14, Z], [ROOM.xMax - 0.09, H - 0.14, 0]);
}

function bellGeometry(radius: number): THREE.LatheGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // Narrow crown flaring to a lip.
    const r = radius * (0.35 + 0.65 * Math.pow(t, 1.8)) + (t > 0.9 ? (t - 0.9) * radius * 1.2 : 0);
    pts.push(new THREE.Vector2(r, radius * 1.3 * (0.5 - t)));
  }
  return new THREE.LatheGeometry(pts, 32);
}

function vaseGeometry(): THREE.LatheGeometry {
  const pts = [
    [0.0, 0],
    [0.09, 0],
    [0.12, 0.05],
    [0.16, 0.18],
    [0.14, 0.32],
    [0.07, 0.42],
    [0.06, 0.5],
    [0.09, 0.56],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, 32);
}

function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d")!);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function placardTexture(): THREE.Texture {
  return canvasTexture(560, 400, (ctx) => {
    ctx.fillStyle = "#efe6d4";
    ctx.fillRect(0, 0, 560, 400);
    ctx.strokeStyle = "#8a6a2c";
    ctx.lineWidth = 6;
    ctx.strokeRect(14, 14, 532, 372);
    ctx.fillStyle = "#3a2a14";
    ctx.textAlign = "center";
    ctx.font = "600 22px Georgia, serif";
    ctx.letterSpacing = "4px";
    ctx.fillText("GALLERY II", 280, 70);
    ctx.letterSpacing = "0px";
    ctx.font = "700 38px Georgia, serif";
    ctx.fillText("The Restless Pendulum", 280, 120);
    ctx.font = "italic 21px Georgia, serif";
    [
      "Here, every swing gains energy instead of losing it.",
      "Let it ring both bells, then read your instrument",
      "and calm it, before it reaches the glass vase.",
      "Too high, and the whole room shakes itself apart.",
    ].forEach((line, i) => ctx.fillText(line, 280, 190 + i * 38));
  });
}

function softDot(): THREE.Texture {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.4, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}
