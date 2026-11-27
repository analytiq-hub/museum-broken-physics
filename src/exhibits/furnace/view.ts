// View of the Backwards Furnace: a dim boiler room. An iron stove that glows as it
// runs away, an ice plug in a brass frame latching the exit door, a wax-sealed
// display case, a lamp and a mirror on a stand that turns to aim the beam, brass
// thermometer labels over each, and frost creeping over the walls.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { AIMS, BEAM_Y, DOOR, LAMP, MIRROR, ROOM, STATIC_BOXES, type FurnaceExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner: lamp, mirror, stove, wax case and the latched door. */
  furnace: { position: [-1.0, 3.2, 3.4] as V3, target: [-8.5, 1.0, -0.6] as V3 },
  /** Close on the ice plug and the door it latches. */
  "furnace-ice": { position: [-9.6, 1.6, 0.6] as V3, target: [ROOM.xMin, 1.3, 0.4] as V3 },
} as const;

export interface FurnaceView {
  update(dt: number): void;
  /** The mirror's parts, for raycasting (userData.interact set by the gallery). */
  mirror: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
const BEAM_COLOR = 0xfff1c8;
const CUSTOM = new Set(["stove", "lamp-stand", "mirror-stand"]);

export function buildFurnaceView(scene: THREE.Object3D, ex: FurnaceExhibit, m: Materials): FurnaceView {
  const byKind: Record<Box["kind"], THREE.Material> = { floor: m.wood, ceiling: m.ceiling, wall: m.wall, glass: m.glass, ledge: m.ledge, pedestal: m.wood };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-") && !CUSTOM.has(b.name))) {
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), byKind[box.kind]);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    mesh.castShadow = box.kind === "pedestal";
    scene.add(mesh);
  }
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);

  // --- The stove: cast iron that glows red, then orange, as it runs away; a flue to the ceiling.
  const stoveBox = STATIC_BOXES.find((b) => b.name === "stove")!;
  const iron = new THREE.MeshStandardMaterial({ color: 0x26211e, metalness: 0.75, roughness: 0.55, emissive: 0x000000 });
  const stove = new THREE.Mesh(new THREE.BoxGeometry(stoveBox.half[0] * 2, stoveBox.half[1] * 2, stoveBox.half[2] * 2), iron);
  stove.position.set(...stoveBox.center);
  stove.castShadow = true;
  scene.add(stove);
  const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, ROOM.height - 1.1, 16), iron);
  flue.position.set(stoveBox.center[0], 1.1 + (ROOM.height - 1.1) / 2, stoveBox.center[2] - 0.15);
  scene.add(flue);
  const stoveGlow = new THREE.PointLight(0xff5a1e, 0, 6, 1.6);
  stoveGlow.position.set(stoveBox.center[0], 1.0, stoveBox.center[2] + 0.9);
  scene.add(stoveGlow);

  // --- The ice plug in a brass frame beside the door, and the latch bar it holds.
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.5, 0.5), m.brass);
  frame.position.set(ROOM.xMin + 0.03, BEAM_Y, AIMS.ice.z);
  scene.add(frame);
  const iceMaterial = new THREE.MeshPhysicalMaterial({ color: 0xd8f0ff, roughness: 0.15, transmission: 0.6, thickness: 0.3, transparent: true, opacity: 0.85 });
  const ice = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.4, 0.4), iceMaterial);
  ice.position.set(ROOM.xMin + 0.17, BEAM_Y, AIMS.ice.z);
  scene.add(ice);
  const latchPivot = new THREE.Group();
  latchPivot.position.set(ROOM.xMin + 0.12, BEAM_Y, AIMS.ice.z + 0.15);
  scene.add(latchPivot);
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 2.1), m.brass);
  latch.position.z = 1.05;
  latchPivot.add(latch);
  const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), new THREE.MeshPhysicalMaterial({ color: 0x9fc4d8, roughness: 0.05, transparent: true, opacity: 0.6 }));
  puddle.rotation.x = -Math.PI / 2;
  puddle.position.set(ROOM.xMin + 0.45, 0.004, AIMS.ice.z);
  scene.add(puddle);
  const steamMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const steam = Array.from({ length: 6 }, (_, i) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.06 + i * 0.015, 10, 8), steamMaterial);
    scene.add(puff);
    return puff;
  });

  // --- The wax-sealed case: a glass box on the plinth, its red seal facing the room.
  const glassCase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.8), new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.35 }));
  glassCase.position.set(AIMS.wax.x, 1.25, ROOM.halfZ - 0.45);
  scene.add(glassCase);
  const waxMaterial = new THREE.MeshStandardMaterial({ color: 0x8e1a14, roughness: 0.5, emissive: 0x000000 });
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), waxMaterial);
  seal.rotation.x = Math.PI / 2;
  seal.position.set(AIMS.wax.x, BEAM_Y, ROOM.halfZ - 0.86);
  scene.add(seal);

  // --- The lamp, and the mirror on its stand (it turns to aim the beam).
  const lampHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.4, 20), m.brass);
  lampHousing.position.set(LAMP.x, BEAM_Y, LAMP.z);
  const toMirror = new THREE.Vector3(MIRROR.x - LAMP.x, 0, MIRROR.z - LAMP.z).normalize();
  lampHousing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toMirror);
  scene.add(lampHousing);
  const stand = (x: number, z: number, height: number) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, height, 12), m.brass);
    pole.position.set(x, height / 2, z);
    scene.add(pole);
  };
  stand(LAMP.x, LAMP.z, BEAM_Y - 0.15);
  stand(MIRROR.x, MIRROR.z, BEAM_Y - 0.25);
  const mirrorGroup = new THREE.Group();
  mirrorGroup.position.set(MIRROR.x, BEAM_Y, MIRROR.z);
  scene.add(mirrorGroup);
  const mirrorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0xe8eef2, metalness: 1, roughness: 0.04 }));
  const mirrorFrame = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.56, 0.66), m.brass);
  mirrorFrame.position.x = -0.02;
  mirrorGroup.add(mirrorPanel, mirrorFrame);

  // --- The beam: lamp → mirror → wherever it is aimed, and a glow where it lands.
  const beamMaterial = new THREE.MeshBasicMaterial({ color: BEAM_COLOR, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const segment = () => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1, 8, 1, true), beamMaterial);
    scene.add(mesh);
    return mesh;
  };
  const beamIn = segment();
  const beamOut = segment();
  const up = new THREE.Vector3(0, 1, 0);
  const place = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) => {
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(1, a.distanceTo(b), 1);
    mesh.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
  };
  const lampPoint = new THREE.Vector3(LAMP.x, BEAM_Y, LAMP.z);
  const mirrorPoint = new THREE.Vector3(MIRROR.x, BEAM_Y, MIRROR.z);
  place(beamIn, lampPoint, mirrorPoint);
  const splash = new THREE.PointLight(BEAM_COLOR, 2.5, 2.5, 2);
  scene.add(splash);

  // --- Brass thermometer labels: a small card over each object, redrawn as temperatures change.
  const thermometer = (at: THREE.Vector3, rotationY: number) => {
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 64;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.16), new THREE.MeshBasicMaterial({ map: texture }));
    card.position.copy(at);
    card.rotation.y = rotationY;
    scene.add(card);
    let shown = "";
    return (t: number) => {
      const text = `${t < 0 ? "−" : ""}${Math.abs(Math.round(t))} °C`;
      if (text === shown) return;
      shown = text;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#c49e54";
      ctx.fillRect(0, 0, 160, 64);
      ctx.fillStyle = "#1c140a";
      ctx.fillRect(6, 6, 148, 52);
      ctx.fillStyle = t >= 60 ? "#ff8a4a" : t >= 0 ? "#f0e2c0" : "#a8d8ff";
      ctx.font = "600 30px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText(text, 80, 43);
      texture.needsUpdate = true;
    };
  };
  const iceLabel = thermometer(new THREE.Vector3(ROOM.xMin + 0.02, BEAM_Y + 0.45, AIMS.ice.z), Math.PI / 2);
  const stoveLabel = thermometer(new THREE.Vector3(stoveBox.center[0], 1.45, -ROOM.halfZ + 0.02), 0);
  const waxLabel = thermometer(new THREE.Vector3(AIMS.wax.x, 1.75, ROOM.halfZ - 0.02), Math.PI);

  // --- Frost creeping over the long walls.
  const frostMaterial = new THREE.MeshBasicMaterial({ map: frostTexture(), transparent: true, opacity: 0, depthWrite: false });
  for (const [z, rotationY] of [
    [-ROOM.halfZ + 0.01, 0],
    [ROOM.halfZ - 0.01, Math.PI],
  ] as [number, number][]) {
    const frost = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.xMax - ROOM.xMin, ROOM.height), frostMaterial);
    frost.position.set((ROOM.xMin + ROOM.xMax) / 2, ROOM.height / 2, z);
    frost.rotation.y = rotationY;
    scene.add(frost);
  }

  scene.add(
    placard(
      {
        kicker: "FLOOR 2 · GALLERY VIII",
        title: "The Backwards Furnace",
        lines: [
          "In this boiler room the warm grow warmer",
          "and the cold grow colder.",
          "The door is latched with ice.",
          "Light can be aimed; heat must be watched.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: a cold, dim room. One shadowed key, a blue-grey fill, the stove's own glow.
  const key = new THREE.SpotLight(0xe8eeff, 38, 18, Math.PI / 3, 0.85, 1.6);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.3, ROOM.halfZ - 0.5);
  key.target.position.set(-7.5, 0.6, -0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xc8d8ff, 3, 10, 1.8);
  fill.position.set(-4, 3, 2.5);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let time = 0;
  let labelClock = 0;
  return {
    mirror: [mirrorPanel, mirrorFrame],
    update(dt) {
      time += dt;
      const T = ex.temperatures;
      // The mirror swings to bisect the lamp's beam and the line to its aim.
      const target = AIMS[ex.aim];
      const targetPoint = new THREE.Vector3(target.x, BEAM_Y, target.z);
      const normal = lampPoint.clone().sub(mirrorPoint).normalize().add(targetPoint.clone().sub(mirrorPoint).normalize()).normalize();
      const wanted = Math.atan2(-normal.z, normal.x);
      let diff = wanted - mirrorGroup.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      mirrorGroup.rotation.y += diff * Math.min(1, dt * 8);
      place(beamOut, mirrorPoint, targetPoint);
      splash.position.copy(targetPoint).lerp(mirrorPoint, 0.04);
      // The stove glows by its temperature.
      const glow = Math.min(1, Math.max(0, (T.stove - 120) / 280));
      iron.emissive.setRGB(0.9 * glow, 0.22 * glow * glow, 0.04 * glow);
      iron.emissiveIntensity = glow > 0 ? 1.2 : 0;
      stoveGlow.intensity = 6 * glow;
      // The ice shrinks as it melts; the latch drops once it lets go; the water steams when hot.
      const remaining = 1 - ex.melted;
      ice.visible = remaining > 0.02;
      ice.scale.set(1, Math.max(0.05, remaining), Math.max(0.05, remaining));
      const latchTarget = ex.unlatched ? 1.3 : 0; // swings down, free of the door
      latchPivot.rotation.x += (latchTarget - latchPivot.rotation.x) * Math.min(1, dt * 6);
      puddle.scale.setScalar(0.2 + 0.8 * ex.melted);
      puddle.visible = ex.melted > 0.01;
      const hot = ex.melted >= 1 ? Math.min(1, Math.max(0, (T.ice - 40) / 60)) : 0;
      steamMaterial.opacity = hot * 0.2;
      steam.forEach((puff, i) => {
        const phase = (time * 0.5 + i / steam.length) % 1;
        puff.position.set(ROOM.xMin + 0.4 + Math.sin(i * 1.7) * 0.15, 0.1 + phase * 2.2, AIMS.ice.z + Math.cos(i * 2.3) * 0.2);
      });
      // The wax glows and sags as it warms.
      const soft = Math.min(1, Math.max(0, (T.wax - 20) / 40));
      waxMaterial.emissive.setRGB(0.5 * soft, 0.08 * soft, 0);
      waxMaterial.emissiveIntensity = soft > 0 ? 1 : 0;
      seal.scale.set(1, 1, ex.waxMelted ? 0.25 : 1 - soft * 0.3);
      seal.position.y = BEAM_Y - (ex.waxMelted ? 0.12 : soft * 0.04);
      frostMaterial.opacity = ex.frost * 0.55;
      door.position.y = ex.door.translation().y;
      labelClock += dt;
      if (labelClock > 0.2) {
        labelClock = 0;
        iceLabel(T.ice);
        stoveLabel(T.stove);
        waxLabel(T.wax);
      }
    },
  };
}

/** Feathery white frost on a transparent canvas. */
function frostTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  let seed = 5;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  ctx.strokeStyle = "rgba(235,245,255,0.55)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 260; i++) {
    // Frost grows up from the floor and in from the corners.
    let x = rand() * 512;
    let y = 256 - Math.pow(rand(), 2) * 200;
    let angle = -Math.PI / 2 + (rand() - 0.5) * 1.6;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      angle += (rand() - 0.5) * 1.2;
      x += Math.cos(angle) * 9;
      y += Math.sin(angle) * 9;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
