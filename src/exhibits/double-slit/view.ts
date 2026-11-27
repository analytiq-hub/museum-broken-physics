// View of Young's Double Slit: a long optical bench in a dim room. A sodium lamp
// whose light takes the colour of its wavelength, a dark plate with two bright
// slits, a long glass tank of water, and a white screen where the bands of light
// and dark are drawn from the same formula the sim uses. A brass sensor sits on
// the screen; an observer lamp on a post can watch the slits.
import * as THREE from "three";
import type { Materials } from "../../render/materials";
import { worldBoxGeometry } from "../../render/materials";
import { placard } from "../../render/placard";
import type { Box } from "../layout";
import { intensity, wavelengthColour } from "./fringes";
import { AXIS_Z, BEAM_Y, DOOR, LAMP_X, OBSERVER, ROOM, SCREEN_X, SENSOR_Y, SLITS_X, STATIC_BOXES, TANK, type DoubleSlitExhibit } from "./sim";

type V3 = [number, number, number];

export const CAMERA_POSES = {
  /** From the entrance corner: lamp, slits, tank and the screen. */
  "double-slit": { position: [-1.0, 3.1, 2.6] as V3, target: [-9.5, 1.0, -2.0] as V3 },
  /** The whole room from high on the south wall: lamp, slits, tank, screen and door (video). */
  "double-slit-wide": { position: [-2.0, 4.2, 3.8] as V3, target: [-7.35, 0.6, -2.15] as V3 },
  /** Facing the screen and its sensor. */
  "double-slit-screen": { position: [SCREEN_X + 3.4, 1.5, AXIS_Z + 0.6] as V3, target: [SCREEN_X, 1.3, AXIS_Z + 0.2] as V3 },
} as const;

export interface DoubleSlitView {
  update(dt: number): void;
  /** The observer lamp's parts (userData.interact set by the gallery). */
  observer: THREE.Object3D[];
}

const TILE: Record<Box["kind"], number> = { floor: 7, ceiling: 3, wall: 3.2, glass: 1, ledge: 2, pedestal: 1.2 };
/** The screen's drawn width along z (m), centred on the optical axis. */
const SCREEN_WIDTH = 3.6;

export function buildDoubleSlitView(scene: THREE.Object3D, ex: DoubleSlitExhibit, m: Materials): DoubleSlitView {
  const byKind: Record<Box["kind"], THREE.Material> = { floor: m.wood, ceiling: m.ceiling, wall: m.wallDark, glass: m.glass, ledge: m.ledge, pedestal: m.wood };
  for (const box of STATIC_BOXES.filter((b) => !b.name.startsWith("corridor-east-"))) {
    const material = box.name === "screen" ? m.wood : box.kind === "wall" ? m.wall : byKind[box.kind];
    const mesh = new THREE.Mesh(worldBoxGeometry(box.half, box.center, TILE[box.kind]), material);
    mesh.position.set(...box.center);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const door = new THREE.Mesh(worldBoxGeometry(DOOR.half, DOOR.center, TILE.wall), m.wall);
  door.position.set(...DOOR.center);
  scene.add(door);

  // --- The lamp: brass housing, its lens glowing in the light's colour.
  const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.45, 20), m.brass);
  housing.rotation.z = Math.PI / 2;
  housing.position.set(LAMP_X, BEAM_Y, AXIS_Z);
  scene.add(housing);
  const lensMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, emissiveIntensity: 3 });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), lensMaterial);
  lens.rotation.y = -Math.PI / 2;
  lens.position.set(LAMP_X - 0.23, BEAM_Y, AXIS_Z);
  scene.add(lens);

  // --- The beam to the slits and the slit plate.
  const beamMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, LAMP_X - 0.23 - SLITS_X, 8, 1, true), beamMaterial);
  beam.rotation.z = Math.PI / 2;
  beam.position.set((LAMP_X - 0.23 + SLITS_X) / 2, BEAM_Y, AXIS_Z);
  scene.add(beam);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.1, 1.0), new THREE.MeshStandardMaterial({ color: 0x1c1712, metalness: 0.5, roughness: 0.6 }));
  plate.position.set(SLITS_X, BEAM_Y, AXIS_Z);
  scene.add(plate);
  const slitMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const dz of [-0.06, 0.06]) {
    const slit = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.5), slitMaterial);
    slit.rotation.y = -Math.PI / 2;
    slit.position.set(SLITS_X - 0.021, BEAM_Y, AXIS_Z + dz);
    scene.add(slit);
  }

  // --- The tank: glass, with water whose tint follows its refractive index.
  const tankGlass = new THREE.Mesh(
    new THREE.BoxGeometry(TANK.x0 - TANK.x1, TANK.y1 - TANK.y0, TANK.halfZ * 2),
    new THREE.MeshPhysicalMaterial({ color: 0xe8f4f6, roughness: 0.05, transmission: 0.9, transparent: true, opacity: 0.25 }),
  );
  tankGlass.position.set((TANK.x0 + TANK.x1) / 2, (TANK.y0 + TANK.y1) / 2, AXIS_Z);
  scene.add(tankGlass);
  const waterMaterial = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false });
  const water = new THREE.Mesh(new THREE.BoxGeometry(TANK.x0 - TANK.x1 - 0.06, TANK.y1 - TANK.y0 - 0.15, TANK.halfZ * 2 - 0.06), waterMaterial);
  water.position.set((TANK.x0 + TANK.x1) / 2, (TANK.y0 + TANK.y1) / 2 - 0.05, AXIS_Z);
  scene.add(water);

  // --- The screen: a white panel on the stand, the pattern drawn on it.
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = 1024;
  patternCanvas.height = 8;
  const patternCtx = patternCanvas.getContext("2d")!;
  const patternTexture = new THREE.CanvasTexture(patternCanvas);
  patternTexture.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH, 1.6), new THREE.MeshBasicMaterial({ map: patternTexture }));
  screen.rotation.y = Math.PI / 2;
  screen.position.set(SCREEN_X + 0.055, 1.4, AXIS_Z);
  scene.add(screen);
  let drawnKey = "";
  const drawPattern = () => {
    const o = ex.optics;
    const key = `${o.wavelength}/${o.index}/${o.observed}`;
    if (key === drawnKey) return;
    drawnKey = key;
    const [r, g, b] = wavelengthColour(o.wavelength);
    const image = patternCtx.createImageData(patternCanvas.width, patternCanvas.height);
    for (let x = 0; x < patternCanvas.width; x++) {
      // Canvas x runs along the plane's width; after the plane's turn, that is −z, so flip it.
      const y = (0.5 - x / patternCanvas.width) * SCREEN_WIDTH;
      const i = intensity(o, y);
      for (let row = 0; row < patternCanvas.height; row++) {
        const p = (row * patternCanvas.width + x) * 4;
        image.data[p] = 18 + 237 * Math.min(1, r * i * 1.2);
        image.data[p + 1] = 16 + 239 * Math.min(1, g * i * 1.2);
        image.data[p + 2] = 14 + 241 * Math.min(1, b * i * 1.2);
        image.data[p + 3] = 255;
      }
    }
    patternCtx.putImageData(image, 0, 0);
    patternTexture.needsUpdate = true;
    lensMaterial.emissive.setRGB(r, g, b);
    beamMaterial.color.setRGB(r, g, b);
    // Water tinted by its index: clear like air near 1, blue for water, violet when "backwards".
    waterMaterial.color.set(o.index < 1 ? 0x9a6ad0 : o.index < 1.2 ? 0xdde8ee : 0x4a90c8);
  };

  // --- The sensor: a brass ring with a glass eye on the screen, glowing green when lit.
  const sensorZ = AXIS_Z + SENSOR_Y;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.08, 24), m.brass);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(SCREEN_X + 0.06, BEAM_Y, sensorZ);
  scene.add(ring);
  const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x1a221a, emissive: 0x000000 });
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20), eyeMaterial);
  eye.rotation.y = Math.PI / 2;
  eye.position.set(SCREEN_X + 0.061, BEAM_Y, sensorZ);
  scene.add(eye);

  // --- The observer lamp on its post: when switched on, it watches the slits.
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.07, 1.4, 12), m.brass);
  post.position.set(OBSERVER.x, 0.7, OBSERVER.z);
  scene.add(post);
  const observerMaterial = new THREE.MeshStandardMaterial({ color: 0x302820, emissive: 0x000000 });
  const observerLamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 12), observerMaterial);
  observerLamp.position.set(OBSERVER.x, 1.48, OBSERVER.z);
  scene.add(observerLamp);
  const observerBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.03, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
  const from = new THREE.Vector3(OBSERVER.x, 1.48, OBSERVER.z);
  const to = new THREE.Vector3(SLITS_X - 0.03, BEAM_Y, AXIS_Z);
  observerBeam.position.copy(from).add(to).multiplyScalar(0.5);
  observerBeam.scale.set(1, from.distanceTo(to), 1);
  observerBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  scene.add(observerBeam);

  scene.add(
    placard(
      {
        kicker: "FLOOR 2 · GALLERY IX · FINALE",
        title: "Young's Double Slit",
        lines: [
          "Light through two slits paints bands on a screen,",
          "and their spacing tells you what the light is.",
          "Two of this room's laws are wrong.",
          "Bring a bright band to the sensor.",
        ],
      },
      new THREE.Vector3(ROOM.xMax - 0.04, 1.5, 1.0 - 1.6),
      -Math.PI / 2,
      m,
    ),
  );

  // --- Lighting: dim, so the pattern shows. A soft key, a low fill, the corridor.
  const key = new THREE.SpotLight(0xfff0dc, 26, 18, Math.PI / 3, 0.9, 1.6);
  key.position.set(ROOM.xMax - 0.5, ROOM.height - 0.3, ROOM.halfZ - 0.5);
  key.target.position.set(-7, 0.4, 0.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const fill = new THREE.PointLight(0xffe2c0, 2.2, 9, 1.8);
  fill.position.set(-6, 2.8, 2.5);
  scene.add(fill);
  const corridorLight = new THREE.PointLight(0xffe2c0, 2.5, 5, 2);
  corridorLight.position.set(ROOM.xMin - 0.5 - 4, 2.4, 2);
  scene.add(corridorLight);

  drawPattern();
  return {
    observer: [observerLamp, post],
    update() {
      drawPattern();
      const lit = ex.sensorLit;
      eyeMaterial.emissive.set(lit ? 0x66ff99 : 0x000000);
      eyeMaterial.emissiveIntensity = lit ? 2 : 0;
      const watching = ex.optics.observed;
      observerMaterial.emissive.set(watching ? 0xffffff : 0x000000);
      observerMaterial.emissiveIntensity = watching ? 1.5 : 0;
      observerBeam.visible = watching;
      door.position.y = ex.door.translation().y;
    },
  };
}
