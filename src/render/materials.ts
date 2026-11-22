// Shared PBR materials for the galleries: textured marble and plaster (CC0,
// Poly Haven, see public/assets/CREDITS.md) and procedural brass and wood.
import * as THREE from "three";

const BASE = `${import.meta.env.BASE_URL}assets/`;

export interface Materials {
  floor: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  wallDark: THREE.MeshStandardMaterial;
  ceiling: THREE.MeshStandardMaterial;
  ledge: THREE.MeshStandardMaterial;
  brass: THREE.MeshPhysicalMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  ballMarble: THREE.MeshPhysicalMaterial;
}

interface PbrSet {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** Loads every texture once and builds the shared materials. */
export async function loadMaterials(renderer: THREE.WebGLRenderer): Promise<Materials> {
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const load = async (file: string, srgb: boolean) => {
    const t = await loader.loadAsync(`${BASE}textures/${file}`);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = anisotropy;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  const pbr = async (name: string): Promise<PbrSet> => {
    const [map, normalMap, roughnessMap] = await Promise.all([
      load(`${name}_diff_1k.jpg`, true),
      load(`${name}_nor_gl_1k.jpg`, false),
      load(`${name}_rough_1k.jpg`, false),
    ]);
    return { map, normalMap, roughnessMap };
  };
  const [tiles, marble, plaster] = await Promise.all([pbr("marble_tiles"), pbr("marble_01"), pbr("grey_plaster")]);
  // The floor's dark veins are too busy at this scale: blend the colour map toward white.
  const floorMap = soften(tiles.map, 0.45, anisotropy);

  const brassRough = scratchTexture(anisotropy);

  return {
    // Polished tiled marble floor.
    floor: new THREE.MeshStandardMaterial({ ...tiles, map: floorMap, roughness: 0.45, color: 0xf4f1ec }),
    // Pale veined marble walls.
    wall: new THREE.MeshStandardMaterial({ ...marble, roughness: 0.75, color: 0xf7f5f0 }),
    // Darker marble for baseboards, trims and the door surround.
    wallDark: new THREE.MeshStandardMaterial({ ...marble, roughness: 0.6, color: 0x6d6457 }),
    ceiling: new THREE.MeshStandardMaterial({ ...plaster, roughness: 1, color: 0xc4bcae }),
    ledge: new THREE.MeshStandardMaterial({ ...marble, roughness: 0.5, color: 0xa79d8c }),
    brass: new THREE.MeshPhysicalMaterial({
      color: 0xc9a14a,
      metalness: 1,
      roughness: 0.42,
      roughnessMap: brassRough,
      clearcoat: 0.2,
      clearcoatRoughness: 0.35,
    }),
    wood: new THREE.MeshStandardMaterial({ map: woodTexture(anisotropy), roughness: 0.55, color: 0xffffff }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xdfeef2,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    ballMarble: new THREE.MeshPhysicalMaterial({
      map: marble.map,
      normalMap: marble.normalMap,
      color: 0xffffff,
      roughness: 0.22,
      clearcoat: 0.6,
      clearcoatRoughness: 0.1,
    }),
  };
}

/** Loads the HDRI and sets it as the scene's environment (reflections and soft fill). */
export async function loadEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene): Promise<void> {
  const { HDRLoader } = await import("three/addons/loaders/HDRLoader.js");
  const hdr = await new HDRLoader().loadAsync(`${BASE}hdri/museum_of_ethnography_1k.hdr`);
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  pmrem.dispose();
  scene.environment = env;
}

/**
 * Box geometry with UVs in world units (`tile` metres per texture repeat),
 * offset by the box's world position so textures line up across neighbouring boxes.
 */
export function worldBoxGeometry(
  half: [number, number, number],
  center: [number, number, number],
  tile: number,
): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(half[0] * 2, half[1] * 2, half[2] * 2);
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + center[0];
    const y = pos.getY(i) + center[1];
    const z = pos.getZ(i) + center[2];
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    if (nx > 0.5) uv.setXY(i, z / tile, y / tile);
    else if (ny > 0.5) uv.setXY(i, x / tile, z / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
  uv.needsUpdate = true;
  return g;
}

/** A copy of a colour texture blended toward white by `amount` (0..1). */
function soften(source: THREE.Texture, amount: number, anisotropy: number): THREE.Texture {
  const image = source.image as HTMLImageElement | ImageBitmap;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  ctx.globalAlpha = amount;
  ctx.fillStyle = "#f4f0e8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Fine directional scratches for brass roughness. */
function scratchTexture(anisotropy: number): THREE.Texture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgb(110,110,110)";
  ctx.fillRect(0, 0, size, size);
  const random = mulberry(7);
  for (let i = 0; i < 900; i++) {
    const v = 60 + random() * 120;
    ctx.strokeStyle = `rgba(${v},${v},${v},${0.15 + random() * 0.25})`;
    ctx.lineWidth = random() * 1.5;
    const x = random() * size;
    const y = random() * size;
    const len = 20 + random() * 120;
    const a = (random() - 0.5) * 0.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

/** Dark walnut grain for the door and the console pedestal. */
function woodTexture(anisotropy: number): THREE.Texture {
  const w = 256;
  const h = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const random = mulberry(11);
  ctx.fillStyle = "#3b2516";
  ctx.fillRect(0, 0, w, h);
  for (let x = 0; x < w; x += 2) {
    const shade = 40 + Math.sin(x * 0.11 + random() * 0.6) * 10 + random() * 8;
    ctx.fillStyle = `rgba(${shade + 30},${shade + 8},${shade - 10},0.35)`;
    ctx.fillRect(x, 0, 1 + random() * 2, h);
  }
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = anisotropy;
  return t;
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
