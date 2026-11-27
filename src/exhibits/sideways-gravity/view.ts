// View of the sideways-gravity gallery: marble, brass and plaster room built
// from the sim's boxes, the ball and door bound to their bodies, the gravity
// console, the gravity tell-tales (plumb line, debris, dust in the light), and
// lighting: a soft key spot with shadows, a target spot with a light shaft,
// and warm wall sconces.
import * as THREE from "three";
import type { BodySync } from "../../engine/bodySync";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { GRAVITY, type GravityDirection } from "../../rules/Rule";
import {
  BALL_RADIUS,
  CONSOLE,
  DEBRIS,
  DOOR,
  DOORWAY,
  GRAVITY_LABELS,
  LEDGE,
  PLUMB_BOB_RADIUS,
  PLUMB_PIVOT,
  ROOM,
  STATIC_BOXES,
  TARGET,
  type Box,
  type SidewaysGravityExhibit,
} from "./sim";

type V3 = [number, number, number];

/** Named camera poses: the player's fixed view plus debugging angles for screenshots. */
export const CAMERA_POSES = {
  /** Eye height at the back of the viewing hall, looking in through the window. */
  window: { position: [0, 1.7, 8.2] as V3, target: [0, 2.6, 0] as V3 },
  /** Inside, up in the front-left corner by the ceiling: shows heights and the ledge's east-end gap. */
  overview: { position: [-5.5, 5.6, 3.7] as V3, target: [2.5, 2, -2.5] as V3 },
  /** Close on the ledge and target. */
  ledge: { position: [-2, 4.2, 2.5] as V3, target: [-4.5, 3.2, -3.2] as V3 },
} as const;

export interface SidewaysGravityView {
  /** Call once per rendered frame with the frame time in seconds. */
  update(dt: number): void;
  /** Console buttons, for raycasting; each mesh has userData.gravity. */
  buttons: THREE.Object3D[];
  /** Highlights the console button under the crosshair (or none). */
  setHovered(direction: GravityDirection | undefined): void;
}

const DUST_COUNT = 700;
/** Dust drifts along gravity this fast (m/s): slow, so it reads as floating motes. */
const DUST_DRIFT = 0.3;

/** Metres per texture repeat, by surface. */
const TILE: Record<Box["kind"], number> = {
  floor: 7,
  ceiling: 3,
  wall: 3.2,
  glass: 1,
  ledge: 2,
  pedestal: 1.2,
};

export function buildSidewaysGravityView(
  scene: THREE.Object3D,
  ex: SidewaysGravityExhibit,
  sync: BodySync,
  m: Materials,
): SidewaysGravityView {
  const byKind: Record<Box["kind"], THREE.Material> = {
    floor: m.floor,
    ceiling: m.ceiling,
    wall: m.wall,
    glass: m.glass,
    ledge: m.ledge,
    pedestal: m.wood,
  };
  const add = (mesh: THREE.Mesh, cast = false, receive = true) => {
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
    return mesh;
  };

  for (const b of STATIC_BOXES) {
    add(box(b.half, b.center, byKind[b.kind], TILE[b.kind]), b.kind === "ledge" || b.kind === "pedestal", b.kind !== "glass");
  }

  buildTrim(add, m);
  buildWindowDetails(scene, m);

  // --- Target: a brass plate on the ledge's west end, marked by an engraved plaque.
  const [tx, , tz] = TARGET.center;
  const plateMaterial = m.brass.clone();
  const ledgeTop = LEDGE.center[1] + LEDGE.half[1];
  add(box([TARGET.half[0] - 0.05, 0.02, TARGET.half[2] - 0.05], [tx, ledgeTop + 0.02, tz], plateMaterial));
  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(TARGET.half[0] * 2 - 0.2, 1.1),
    new THREE.MeshPhysicalMaterial({ ...brassProps(m.brass), map: plaqueTexture() }),
  );
  plaque.position.set(tx, ledgeTop + 0.75, -ROOM.halfZ + 0.012);
  scene.add(plaque);
  // Brass edge along the ledge's front.
  add(box([LEDGE.half[0], 0.025, 0.02], [LEDGE.center[0], ledgeTop - 0.02, LEDGE.center[2] + LEDGE.half[2] + 0.02], m.brass));

  // --- Door: walnut, bound to its kinematic body so it sinks into the floor when solved.
  const door = add(box(DOOR.half, DOOR.center, m.wood, 1), true);
  sync.bind(ex.door, door);

  // --- Ball: polished marble, so rolling shows in its veins.
  const ball = add(new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 64, 32), m.ballMarble), true);
  sync.bind(ex.ball, ball);

  // --- Gravity console: five brass buttons on a slanted panel, laid out like the
  // room as seen from the viewing hall (back wall at the top, window at the bottom).
  const consoleTop = CONSOLE.center[1] + CONSOLE.half[1];
  const panelGroup = new THREE.Group();
  const tilt = 0.45;
  panelGroup.position.set(CONSOLE.center[0], consoleTop + Math.sin(tilt) * (PANEL.depth / 2) + 0.03, CONSOLE.center[2]);
  panelGroup.rotation.x = tilt;
  scene.add(panelGroup);
  // Brushed and slightly dulled: a polished tilted face mirrors the laylight
  // straight into the player's eyes (and bloom turns that into a blaze).
  const satin = m.brass.clone();
  satin.roughness = 0.85;
  satin.metalness = 0.7;
  satin.clearcoat = 0;
  const face = new THREE.Mesh(new THREE.BoxGeometry(PANEL.width, 0.04, PANEL.depth), satin);
  face.castShadow = true;
  panelGroup.add(face);
  const labels = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL.width - 0.04, PANEL.depth - 0.04),
    new THREE.MeshStandardMaterial({ map: consoleLabels(), transparent: true, roughness: 0.6, metalness: 0.3 }),
  );
  labels.rotation.x = -Math.PI / 2;
  labels.position.y = 0.021;
  panelGroup.add(labels);

  const buttonMaterials = new Map<GravityDirection, THREE.MeshPhysicalMaterial>();
  const buttonMeshes = new Map<GravityDirection, THREE.Mesh>();
  for (const [direction, [x, z]] of Object.entries(BUTTON_LAYOUT) as [GravityDirection, [number, number]][]) {
    const material = satin.clone();
    material.roughness = 0.55;
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.066, 0.04, 32), material);
    button.position.set(x, 0.04, z);
    button.userData.gravity = direction;
    panelGroup.add(button);
    // A dark ring sunk around each button, so they read as buttons, not holes.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.066, 0.078, 32), new THREE.MeshBasicMaterial({ color: 0x2a1f12 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.0215, z);
    panelGroup.add(ring);
    buttonMaterials.set(direction, material);
    buttonMeshes.set(direction, button);
  }
  let hovered: GravityDirection | undefined;

  // --- Placard in the viewing hall.
  const placardStand = new THREE.Group();
  placardStand.position.set(-2.6, 0, 5.6);
  scene.add(placardStand);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 1.0, 16), m.brass);
  post.position.y = 0.5;
  placardStand.add(post);
  const placard = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 0.5, 0.02),
    [m.wood, m.wood, m.wood, m.wood, new THREE.MeshStandardMaterial({ map: placardTexture(), roughness: 0.7 }), m.wood],
  );
  placard.position.set(0, 1.12, 0);
  placard.rotation.x = -0.5;
  placard.castShadow = true;
  placardStand.add(placard);

  // --- Gravity tell-tales ---------------------------------------------------
  // Plumb line: brass bracket, a thin line, and the brass bob bound to its body.
  const pivot = new THREE.Vector3(PLUMB_PIVOT.x, PLUMB_PIVOT.y, PLUMB_PIVOT.z);
  const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, ROOM.height - PLUMB_PIVOT.y), m.brass);
  bracket.position.set(pivot.x, (ROOM.height + PLUMB_PIVOT.y) / 2, pivot.z);
  scene.add(bracket);
  const bob = new THREE.Mesh(new THREE.ConeGeometry(PLUMB_BOB_RADIUS, PLUMB_BOB_RADIUS * 2.5, 24), m.brass);
  bob.castShadow = true;
  // The joint keeps the pivot at local (−L, 0, 0) in the bob's frame, so pointing
  // the cone's tip (+y) along local +x always points it away from the pivot.
  bob.rotation.z = -Math.PI / 2;
  const bobHolder = new THREE.Group();
  bobHolder.add(bob);
  scene.add(bobHolder);
  sync.bind(ex.plumbBob, bobHolder);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([pivot, pivot.clone()]);
  scene.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({ color: 0xe8dcc0 })));

  // Loose debris: chips of the room's own marble.
  ex.debris.forEach((body, i) => {
    const s = DEBRIS[i][0] * 2;
    const chip = add(new THREE.Mesh(new THREE.DodecahedronGeometry(s * 0.62, 0), m.ledge), true);
    chip.scale.set(1, 0.8, 1.15);
    sync.bind(body, chip);
  });

  // Dust: soft motes drifting along gravity, wrapping around inside the room.
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  for (let i = 0; i < DUST_COUNT; i++) {
    dustPositions[i * 3] = (Math.random() * 2 - 1) * ROOM.halfX;
    dustPositions[i * 3 + 1] = Math.random() * ROOM.height;
    dustPositions[i * 3 + 2] = (Math.random() * 2 - 1) * ROOM.halfZ;
  }
  const dustGeometry = new THREE.BufferGeometry();
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(dustPositions, 3));
  scene.add(
    new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({
        map: softDot(),
        color: 0xfff0cc,
        size: 0.05,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );

  // --- Laylight: a frosted skylight panel in the gallery ceiling, with brass glazing bars.
  const lay = { halfX: 3, halfZ: 2, y: ROOM.height - 0.01 };
  const laylight = new THREE.Mesh(
    new THREE.PlaneGeometry(lay.halfX * 2, lay.halfZ * 2),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff4e2, emissiveIntensity: 0.4 }),
  );
  laylight.rotation.x = Math.PI / 2;
  laylight.position.set(0, lay.y, 0);
  scene.add(laylight);
  for (let i = -2; i <= 2; i++) {
    const barX = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.04, lay.halfZ * 2), m.brass);
    barX.position.set((i * lay.halfX) / 2, lay.y - 0.02, 0);
    scene.add(barX);
  }
  for (let j = -1; j <= 1; j++) {
    const barZ = new THREE.Mesh(new THREE.BoxGeometry(lay.halfX * 2, 0.04, 0.05), m.brass);
    barZ.position.set(0, lay.y - 0.02, j * lay.halfZ);
    scene.add(barZ);
  }
  // Fill comes from the sides, never from straight overhead: the console sits in the
  // middle of the room, and an overhead light mirrors off its brass into the player's
  // eyes from wherever they stand. Side light glances off it instead.
  for (const x of [-4.6, 4.6]) {
    const wash = new THREE.PointLight(0xfff1de, 9, 9, 1.6);
    wash.position.set(x, 4.6, 0.5);
    scene.add(wash);
  }

  // --- Lighting ----------------------------------------------------------------
  // Key: a soft spot in the front-right upper corner raking across the room (and
  // casting its one shadow map). Off to the side, so the console isn't in its hot centre.
  const key = new THREE.SpotLight(0xfff3e2, 120, 24, Math.PI / 3.2, 0.9, 1.6);
  key.position.set(5.6, 5.85, 3.6);
  key.target.position.set(-2, 1.8, -2.8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  // Target spot with a faint light shaft.
  const spotPos = new THREE.Vector3(-3.6, 5.9, -1.2);
  const targetPos = new THREE.Vector3(tx, ledgeTop, tz);
  const spot = new THREE.SpotLight(0xfff4e4, 45, 12, Math.PI / 9, 0.5, 1.5);
  spot.position.copy(spotPos);
  spot.target.position.copy(targetPos);
  scene.add(spot, spot.target);
  scene.add(lightShaft(spotPos, targetPos, Math.PI / 9));

  // Warm wall sconces, kept low so the ball (high, or on the floor once failed) never meets them.
  for (const [x, z, facing] of [
    [ROOM.halfX, -2.4, -1],
    [ROOM.halfX, 2.4, -1],
    [-ROOM.halfX, -2.4, 1],
  ] as [number, number, number][]) {
    scene.add(sconce(m, new THREE.Vector3(x + facing * 0.02, 2.1, z), facing));
  }
  // Viewing hall: one pendant.
  const pendant = new THREE.PointLight(0xffe4c4, 8, 9, 1.8);
  pendant.position.set(0, 4.2, 6.6);
  scene.add(pendant);
  const shade = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 12), new THREE.MeshStandardMaterial({ emissive: 0xffe4c4, emissiveIntensity: 1.4, color: 0x000000 }));
  shade.position.copy(pendant.position);
  scene.add(shade);
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, ROOM.height - 4.2), m.brass);
  cord.position.set(0, (ROOM.height + 4.2) / 2, 6.6);
  scene.add(cord);

  const g = new THREE.Vector3();
  const bounds = [ROOM.halfX, ROOM.height / 2, ROOM.halfZ];
  const centre = [0, ROOM.height / 2, 0];
  return {
    buttons: [...buttonMeshes.values()],
    setHovered(direction) {
      hovered = direction;
    },
    update(dt: number) {
      const dir = GRAVITY[ex.rule("gravity").current as keyof typeof GRAVITY];
      g.set(dir.x, dir.y, dir.z).normalize();
      plateMaterial.emissive.set(ex.isSolved() ? 0x9a7020 : 0x000000);

      // Console: the active direction glows and sits pressed in; the hovered one brightens.
      const current = ex.rule("gravity").current as GravityDirection;
      for (const [direction, material] of buttonMaterials) {
        const active = direction === current;
        material.emissive.set(active ? 0xb07a1a : direction === hovered ? 0x5a4520 : 0x000000);
        buttonMeshes.get(direction)!.position.y = active ? 0.025 : 0.04;
      }

      // Plumb line from the pivot to the bob.
      lineGeometry.attributes.position.setXYZ(1, bobHolder.position.x, bobHolder.position.y, bobHolder.position.z);
      lineGeometry.attributes.position.needsUpdate = true;

      // Dust drifts along gravity with a little shimmer, and wraps inside the room.
      const p = dustGeometry.attributes.position as THREE.BufferAttribute;
      const step = [g.x * DUST_DRIFT * dt, g.y * DUST_DRIFT * dt, g.z * DUST_DRIFT * dt];
      for (let i = 0; i < DUST_COUNT; i++) {
        for (let a = 0; a < 3; a++) {
          let v = p.array[i * 3 + a] + step[a] + (Math.random() - 0.5) * 0.004;
          const lo = centre[a] - bounds[a];
          const hi = centre[a] + bounds[a];
          if (v < lo) v = hi;
          else if (v > hi) v = lo;
          p.array[i * 3 + a] = v;
        }
      }
      p.needsUpdate = true;
    },
  };
}

type AddFn = (mesh: THREE.Mesh, cast?: boolean, receive?: boolean) => THREE.Mesh;

/** A box mesh at `center`, with world-scale UVs (`tile` metres per texture repeat). */
function box(half: V3, center: V3, material: THREE.Material, tile = 1): THREE.Mesh {
  const mesh = new THREE.Mesh(worldBoxGeometry(half, center, tile), material);
  mesh.position.set(...center);
  return mesh;
}

/** Baseboards, cornice and the door surround, in dark marble. */
function buildTrim(add: AddFn, m: Materials): void {
  const H = ROOM.height;
  const X = ROOM.halfX;
  const Z = ROOM.halfZ;
  const base = 0.09; // half-height of the baseboard
  const out = 0.02; // how far trim stands off the wall
  const d = m.wallDark;
  // Gallery baseboards (the west wall is split by the door).
  add(box([X, base, out], [0, base, -Z + out], d, 2));
  add(box([out, base, Z], [X - out, base, 0], d, 2));
  add(box([out, base, 1.25], [-X + out, base, -2.75], d, 2));
  add(box([out, base, 0.5], [-X + out, base, 3.5], d, 2));
  // Gallery cornice.
  for (const [half, c] of [
    [[X, 0.12, 0.08], [0, H - 0.12, -Z + 0.08]],
    [[0.08, 0.12, Z], [X - 0.08, H - 0.12, 0]],
    [[0.08, 0.12, Z], [-X + 0.08, H - 0.12, 0]],
  ] as [V3, V3][]) {
    add(box(half, c, d, 2));
  }
  // Door surround on the gallery side.
  const [, , dz] = DOOR.center;
  const dh = DOOR.half[1] * 2;
  add(box([0.03, dh / 2 + 0.1, 0.1], [-X + 0.03, dh / 2 + 0.1, dz - DOOR.half[2] - 0.1], d), true);
  add(box([0.03, dh / 2 + 0.1, 0.1], [-X + 0.03, dh / 2 + 0.1, dz + DOOR.half[2] + 0.1], d), true);
  add(box([0.03, 0.1, DOOR.half[2] + 0.2], [-X + 0.03, dh + 0.1, dz], d), true);
  // Viewing hall baseboards.
  add(box([X, base, out], [0, base, 8.5 - out], d, 2));
  add(box([out, base, 2], [X - out, base, 6.5], d, 2));
  add(box([out, base, 2], [-X + out, base, 6.5], d, 2));
}

/** Brass frames for the glass and the doorway, plus cracks in the panes. */
function buildWindowDetails(scene: THREE.Object3D, m: Materials): void {
  const zWin = ROOM.halfZ + 0.25;
  const frame = (w: number, h: number, x: number, y: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.56), m.brass);
    mesh.position.set(x, y, zWin);
    mesh.castShadow = true;
    scene.add(mesh);
  };
  const hw = DOORWAY.halfWidth;
  frame(0.08, DOORWAY.height, -hw - 0.04, DOORWAY.height / 2); // doorway jambs
  frame(0.08, DOORWAY.height, hw + 0.04, DOORWAY.height / 2);
  frame(hw * 2 + 0.16, 0.08, 0, DOORWAY.height + 0.04); // doorway head
  frame(ROOM.halfX * 2, 0.06, 0, ROOM.height - 0.03); // top rail
  for (const x of [-4, 4]) frame(0.05, ROOM.height, x, ROOM.height / 2); // mullions

  // Fractured glass: a crack decal on each side pane.
  const cracks = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, opacity: 0.8 });
  for (const [x, y, s] of [
    [-3.2, 3.4, 2.6],
    [4.6, 1.8, 2.0],
  ] as [number, number, number][]) {
    const decal = new THREE.Mesh(new THREE.PlaneGeometry(s, s), cracks);
    decal.position.set(x, y, ROOM.halfZ + 0.005);
    decal.rotation.y = Math.PI;
    scene.add(decal);
  }
}

function sconce(m: Materials, at: THREE.Vector3, facing: number): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(at);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 24), m.brass);
  plate.rotation.z = Math.PI / 2;
  group.add(plate);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.18), m.brass);
  arm.rotation.z = Math.PI / 2;
  arm.position.x = facing * 0.09;
  group.add(arm);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffdcaa, emissiveIntensity: 1.6 }),
  );
  bulb.position.set(facing * 0.19, 0.04, 0);
  group.add(bulb);
  const light = new THREE.PointLight(0xffd7a8, 3, 5, 2);
  light.position.copy(bulb.position);
  group.add(light);
  return group;
}

/** An additive cone of faint light from `from` toward `to`. */
function lightShaft(from: THREE.Vector3, to: THREE.Vector3, angle: number): THREE.Mesh {
  const length = from.distanceTo(to);
  const geometry = new THREE.ConeGeometry(Math.tan(angle) * length, length, 32, 1, true);
  geometry.translate(0, -length / 2, 0); // apex at the origin
  const material = new THREE.MeshBasicMaterial({
    color: 0xfff1d0,
    transparent: true,
    opacity: 0.018,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const shaft = new THREE.Mesh(geometry, material);
  shaft.position.copy(from);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), to.clone().sub(from).normalize());
  return shaft;
}

function brassProps(b: THREE.MeshPhysicalMaterial): THREE.MeshPhysicalMaterialParameters {
  return { color: b.color, metalness: b.metalness, roughness: b.roughness, clearcoat: b.clearcoat };
}

/** The console's slanted brass face (m). */
const PANEL = { width: 0.9, depth: 0.8 } as const;

/** Button positions on the console face (local x, z; −z is the top edge). Labels sit below each. */
const BUTTON_LAYOUT: Partial<Record<GravityDirection, [number, number]>> = {
  north: [0, -0.22],
  west: [-0.28, 0],
  down: [0, 0],
  east: [0.28, 0],
  south: [0, 0.22],
};
/** Label offset below a button's centre (m, toward the player). */
const LABEL_OFFSET = 0.08;

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

/** Engraved labels under each console button. */
function consoleLabels(): THREE.Texture {
  const w = PANEL.width - 0.04;
  const d = PANEL.depth - 0.04;
  const W = 512;
  const H = Math.round((W * d) / w);
  return canvasTexture(W, H, (ctx) => {
    ctx.fillStyle = "#2a1f12";
    ctx.font = "600 22px Georgia, serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const [direction, [x, z]] of Object.entries(BUTTON_LAYOUT) as [GravityDirection, [number, number]][]) {
      const u = ((x + w / 2) / w) * W;
      const v = ((z + LABEL_OFFSET + d / 2) / d) * H;
      ctx.fillText(GRAVITY_LABELS[direction].toUpperCase(), u, v - 11);
    }
    ctx.font = "700 20px Georgia, serif";
    ctx.letterSpacing = "6px";
    ctx.fillText("GRAVITY", W / 2, 10);
    ctx.strokeStyle = "#2a1f12";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, W - 16, H - 16);
  });
}

/** The engraved plaque above the target. */
function plaqueTexture(): THREE.Texture {
  return canvasTexture(256, 220, (ctx) => {
    ctx.fillStyle = "#c9a14a";
    ctx.fillRect(0, 0, 256, 220);
    ctx.strokeStyle = "#3a2a14";
    ctx.fillStyle = "#3a2a14";
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 236, 200);
    ctx.beginPath();
    ctx.arc(128, 96, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(128, 96, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "600 20px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("REST HERE", 128, 182);
  });
}

/** The gallery's placard in the viewing hall. */
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
    ctx.fillText("FLOOR 1 · GALLERY I", 280, 70);
    ctx.letterSpacing = "0px";
    ctx.font = "700 38px Georgia, serif";
    ctx.fillText("The Sideways Gallery", 280, 120);
    ctx.font = "italic 21px Georgia, serif";
    const lines = [
      "Here, gravity has forgotten which way is down.",
      "Use the console inside to point it elsewhere,",
      "and bring the marble to rest on the brass plate.",
      "Mind the floor: a fallen marble never climbs back.",
    ];
    lines.forEach((line, i) => ctx.fillText(line, 280, 190 + i * 38));
  });
}

/** Radial soft dot for dust. */
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

/** Branching cracks radiating from an impact point, on transparent. */
function crackTexture(): THREE.Texture {
  return canvasTexture(512, 512, (ctx) => {
    let seed = 3;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineCap = "round";
    const crack = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
      let cx = x;
      let cy = y;
      const steps = 6;
      for (let s = 0; s < steps; s++) {
        const a = angle + (random() - 0.5) * 0.6;
        const nx = cx + Math.cos(a) * (length / steps);
        const ny = cy + Math.sin(a) * (length / steps);
        ctx.lineWidth = width * (1 - s / steps) + 0.3;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        if (depth > 0 && random() < 0.35) crack(nx, ny, a + (random() - 0.5) * 1.6, length * 0.45, width * 0.6, depth - 1);
        cx = nx;
        cy = ny;
      }
    };
    for (let i = 0; i < 9; i++) crack(256, 256, (i / 9) * Math.PI * 2 + random() * 0.4, 150 + random() * 90, 2.2, 2);
    // Concentric rings around the impact.
    for (const r of [26, 52]) {
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.35) {
        const rr = r + (random() - 0.5) * 8;
        const px = 256 + Math.cos(a) * rr;
        const py = 256 + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
  });
}
