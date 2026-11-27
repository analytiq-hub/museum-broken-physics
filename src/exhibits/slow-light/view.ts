// View of Slow Light: a long bench with a brass flash lamp at the east end, cell A
// a metre down the bench, and at the far end a clockwork shutter in front of cell B,
// with a dial showing when it opens. A brass ruler marks the metres along the bench,
// so a slow flash can be timed by eye. On the back wall, the lock's display: whether
// both cells lit together, and if not, how far apart.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { BEAM, BENCH_Y, DOOR, ROOM, SCORCH_LIMIT, SHUTTER, STATIC_BOXES, type Reading, type SlowLightExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner, down the bench. */
  "slow-light": { position: [-0.9, 2.6, 3.2] as V3, target: [-6.4, 1.2, -2.6] as V3 },
  /** Along the bench from beside the lamp: the flash, the cells, the shutter and the display. */
  "slow-light-bench": { position: [-6.2, 2.3, 3.4] as V3, target: [-6.4, 1.3, -2.2] as V3 },
} as const;

export interface SlowLightView {
  update(dt: number): void;
  /** The lamp's parts (userData.interact set by the gallery). */
  lamp: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
/** How long a flash's glow trails behind its front (m). */
const TRAIL = 0.7;
const DISPLAY = { w: 1024, h: 512 } as const;

function drawDial(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#efe6d4";
  c.beginPath();
  c.arc(128, 128, 124, 0, Math.PI * 2);
  c.fill();
  // The open sector, starting at twelve o'clock and running clockwise.
  const open = (SHUTTER.open / SHUTTER.period) * Math.PI * 2;
  c.fillStyle = "#3f9a5a";
  c.beginPath();
  c.moveTo(128, 128);
  c.arc(128, 128, 112, -Math.PI / 2, -Math.PI / 2 + open);
  c.closePath();
  c.fill();
  c.strokeStyle = "#3a2a14";
  c.lineWidth = 4;
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    const r0 = i % 4 === 0 ? 92 : 104;
    c.beginPath();
    c.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0);
    c.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116);
    c.stroke();
  }
  c.lineWidth = 6;
  c.strokeStyle = "#8a6a2c";
  c.beginPath();
  c.arc(128, 128, 122, 0, Math.PI * 2);
  c.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawRuler(metres: number): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64 * metres;
  canvas.height = 32;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#b8923e";
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = "#2a1c0a";
  c.font = "600 16px Georgia, serif";
  c.textAlign = "center";
  for (let i = 0; i <= metres * 10; i++) {
    const x = (i / 10) * 64;
    const major = i % 10 === 0;
    c.fillRect(Math.min(canvas.width - 2, x), 0, 2, major ? 18 : i % 5 === 0 ? 12 : 7);
    // Counted from the lamp, which is at the right-hand (east) end as the player faces the bench.
    if (major && i > 0 && i < metres * 10) c.fillText(`${metres - i / 10} m`, x, 30);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function buildSlowLightView(scene: THREE.Object3D, ex: SlowLightExhibit, m: Materials): SlowLightView {
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

  // --- The ruler along the bench's front edge, metres counted from the lamp.
  const metres = Math.round(BEAM.lamp - BEAM.cellB);
  const ruler = new THREE.Mesh(new THREE.PlaneGeometry(metres, 0.06), new THREE.MeshStandardMaterial({ map: drawRuler(metres), metalness: 0.6, roughness: 0.4 }));
  ruler.rotation.x = -Math.PI / 2;
  ruler.position.set(BEAM.lamp - metres / 2, BENCH_Y + 0.002, BEAM.z + 0.36);
  scene.add(ruler);

  // --- The flash lamp: a brass drum on a stand, its lens facing west, and a push button.
  const lampGroup = new THREE.Group();
  lampGroup.position.set(BEAM.lamp, BEAM.y, BEAM.z);
  scene.add(lampGroup);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 24), m.brass);
  drum.rotation.z = Math.PI / 2;
  drum.position.x = 0.1;
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff2d0, emissiveIntensity: 0.2, roughness: 0.1 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.11, 24), lensMaterial);
  lens.rotation.y = -Math.PI / 2;
  lens.position.x = -0.051;
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, BEAM.y - BENCH_Y, 10), m.brass);
  stand.position.set(0.1, -(BEAM.y - BENCH_Y) / 2, 0);
  const buttonMaterial = new THREE.MeshPhysicalMaterial({ color: 0x8a1a1a, roughness: 0.35, clearcoat: 0.6, emissive: 0x000000 });
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 18), buttonMaterial);
  button.rotation.x = Math.PI / 2;
  button.position.set(0.1, 0, 0.15);
  lampGroup.add(drum, lens, stand, button);

  // --- Photocells: a brass post with a glass eye that glows when light reaches it.
  const cell = (x: number) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, BEAM.y - BENCH_Y - 0.06, 10), m.brass);
    post.position.set(x, (BEAM.y + BENCH_Y - 0.06) / 2, BEAM.z - 0.16);
    const material = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x66ff99, emissiveIntensity: 0, roughness: 0.2 });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), material);
    eye.position.set(x, BEAM.y, BEAM.z - 0.16);
    scene.add(post, eye);
    return material;
  };
  const eyeA = cell(BEAM.cellA);
  const eyeB = cell(BEAM.cellB - 0.15);

  // --- The shutter at the far end: a brass frame, a plate that lifts, and the dial.
  const frameX = BEAM.cellB + 0.05;
  for (const z of [-0.3, 0.3]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.8, 0.05), m.brass);
    side.position.set(frameX, BENCH_Y + 0.4, BEAM.z + z);
    scene.add(side);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.66), m.brass);
  top.position.set(frameX, BENCH_Y + 0.82, BEAM.z);
  scene.add(top);
  const plateMaterial = new THREE.MeshStandardMaterial({ color: 0x2c2622, metalness: 0.5, roughness: 0.55 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.34, 0.56), plateMaterial);
  const plateShutY = BEAM.y;
  plate.position.set(frameX, plateShutY, BEAM.z);
  scene.add(plate);
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.3, 48), new THREE.MeshStandardMaterial({ map: drawDial(), roughness: 0.6 }));
  dial.position.set(frameX, BENCH_Y + 1.25, BEAM.z + 0.05);
  dial.rotation.y = 0.5;
  const dialPost = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 10), m.brass);
  dialPost.position.set(frameX, BENCH_Y + 0.94, BEAM.z);
  scene.add(dialPost);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 8, 40), m.brass);
  rim.position.copy(dial.position);
  rim.rotation.y = dial.rotation.y;
  scene.add(rim);
  scene.add(dial);
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.25, 0.008), new THREE.MeshStandardMaterial({ color: 0x1a1208 }));
  hand.geometry.translate(0, 0.1, 0);
  const handPivot = new THREE.Group();
  handPivot.position.copy(dial.position);
  handPivot.rotation.y = dial.rotation.y;
  handPivot.translateZ(0.006);
  handPivot.add(hand);
  scene.add(handPivot);

  // --- The flash in flight: a bright head and a trail behind it.
  const pulseMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const heads = [0, 1].map(() => {
    const head = new THREE.Group();
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), pulseMaterial);
    const trail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.0, TRAIL, 12, 1, true), pulseMaterial);
    trail.rotation.z = Math.PI / 2;
    trail.position.x = TRAIL / 2;
    head.add(core, trail);
    head.visible = false;
    scene.add(head);
    return head;
  });
  // An instant flash (light at its true speed): the whole beam, for a moment.
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfff4d8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 10, 1, true), beamMaterial);
  beam.rotation.z = Math.PI / 2;
  scene.add(beam);
  const flashLight = new THREE.PointLight(0xfff0d0, 0, 3, 2);
  scene.add(flashLight);

  // --- The lock's display on the back wall.
  const displayCanvas = document.createElement("canvas");
  displayCanvas.width = DISPLAY.w;
  displayCanvas.height = DISPLAY.h;
  const displayTexture = new THREE.CanvasTexture(displayCanvas);
  displayTexture.colorSpace = THREE.SRGBColorSpace;
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.2),
    new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveMap: displayTexture, emissiveIntensity: 1.1, roughness: 0.6 }),
  );
  display.position.set((BEAM.lamp + BEAM.cellB) / 2, 2.35, -ROOM.halfZ + 0.05);
  scene.add(display);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.56, 1.36, 0.04), m.wood);
  frame.position.set(display.position.x, display.position.y, -ROOM.halfZ + 0.01);
  scene.add(frame);
  const drawDisplay = (reading: Reading, scorches: number) => {
    const c = displayCanvas.getContext("2d")!;
    c.fillStyle = "#0b0f0c";
    c.fillRect(0, 0, DISPLAY.w, DISPLAY.h);
    c.textAlign = "center";
    c.fillStyle = "#c8b07a";
    c.font = "600 56px Georgia, serif";
    c.fillText("COINCIDENCE LOCK", DISPLAY.w / 2, 90);
    c.font = "italic 38px Georgia, serif";
    c.fillText("opens when one flash lights A and B together", DISPLAY.w / 2, 155);
    c.font = "600 76px Georgia, serif";
    const text =
      reading.kind === "together"
        ? ["A and B: together", "#7dffb0"]
        : reading.kind === "apart"
          ? [`B lit ${reading.seconds.toFixed(2)} s after A`, "#ffcf6a"]
          : reading.kind === "scorched"
            ? ["B dark: the shutter was shut", "#ff7a5a"]
            : ["waiting for a flash", "#8a9a8e"];
    c.fillStyle = text[1];
    c.fillText(text[0], DISPLAY.w / 2, 300);
    c.font = "38px Georgia, serif";
    c.fillStyle = "#8a9a8e";
    c.fillText(`shutter scorch marks: ${scorches} of ${SCORCH_LIMIT}`, DISPLAY.w / 2, 440);
    displayTexture.needsUpdate = true;
  };

  scene.add(
    placard(
      {
        kicker: "FLOOR 3 · GALLERY XIII",
        title: "Slow Light",
        lines: ["The lock opens for one flash", "seen by both cells at the same instant.", "Every flash should be.", "Watch one cross the room."],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, -1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: dim and cool, so the flash shows. A key from the corner, a fill, the corridor.
  const key = new THREE.SpotLight(0xe8f0ff, 40, 18, Math.PI / 3.2, 0.85, 1.6);
  key.position.set(-4.5, ROOM.height - 0.3, 2.6);
  key.target.position.set(-7, 0.8, BEAM.z);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xd8e4ff, 3.5, 10, 1.6);
  fill.position.set(-8, 2.6, 1.5);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  let shownReading = "";
  let plateLift = 0;
  let lastCharge = 1;
  let instant = 0;
  return {
    lamp: [drum, lens, button],
    update(dt) {
      // The lamp: the lens glows as it recharges; the button lights when ready.
      const charge = ex.charge;
      if (charge < lastCharge - 0.5) instant = ex.speed > 1000 ? 1 : 0.0001; // just fired
      lastCharge = charge;
      lensMaterial.emissiveIntensity = 0.15 + 0.5 * charge * charge;
      buttonMaterial.emissive.setRGB(charge >= 1 ? 0.5 : 0, 0, 0);
      // The flashes in flight.
      const pulses = ex.pulses;
      heads.forEach((head, i) => {
        const p = pulses[i];
        head.visible = !!p;
        if (p) head.position.set(p.x, BEAM.y, BEAM.z);
      });
      // A true-speed flash fills the whole beam at once, up to the shutter (or through it).
      instant = Math.max(0, instant - dt * 5);
      const end = ex.shutterIsOpen ? BEAM.cellB - 0.15 : BEAM.cellB + 0.06;
      beam.scale.y = BEAM.lamp - end;
      beam.position.set((BEAM.lamp + end) / 2, BEAM.y, BEAM.z);
      beamMaterial.opacity = instant > 0.001 ? instant : 0;
      const lead = pulses[0];
      flashLight.intensity = lead ? 1.5 : instant * 3;
      flashLight.position.set(lead ? lead.x : BEAM.lamp - 1, BEAM.y + 0.2, BEAM.z + 0.3);
      // Cells glow for a moment after light reaches them.
      const since = ex.sinceLit();
      eyeA.emissiveIntensity = Math.max(0, 2.5 - since.a / 15);
      eyeB.emissiveIntensity = ex.isSolved() ? 2.5 : Math.max(0, 2.5 - since.b / 15);
      // The shutter plate lifts while open; scorches darken it.
      plateLift += ((ex.shutterIsOpen || ex.isSolved() ? 1 : 0) - plateLift) * Math.min(1, dt * 30);
      plate.position.y = plateShutY + plateLift * 0.36;
      plateMaterial.color.setRGB(0.17 - 0.05 * ex.scorches, 0.15 - 0.05 * ex.scorches, 0.13 - 0.05 * ex.scorches);
      // The dial's hand: at twelve when the shutter opens, round once per cycle.
      hand.rotation.z = -ex.shutterPhase * Math.PI * 2;
      const shown = JSON.stringify(ex.reading) + ex.scorches;
      if (shown !== shownReading) {
        shownReading = shown;
        drawDisplay(ex.reading, ex.scorches);
      }
      door.position.y = ex.door.translation().y;
    },
  };
}
