// Frees what a gallery's group put on the GPU (geometries, room-only materials and
// their textures) when the gallery is unloaded. Materials and textures shared by
// every room (loadMaterials) stay: a room's clone of a shared material (a glowing
// organ pipe) shares its textures, so those are kept too.
import * as THREE from "three";
import type { Materials } from "./materials";

const TEXTURE_SLOTS = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap", "emissiveMap", "alphaMap", "bumpMap", "clearcoatNormalMap"] as const;

function texturesOf(material: THREE.Material): THREE.Texture[] {
  const record = material as unknown as Record<string, unknown>;
  return TEXTURE_SLOTS.map((slot) => record[slot]).filter((t): t is THREE.Texture => t instanceof THREE.Texture);
}

export function disposeGroup(group: THREE.Object3D, shared: Materials): void {
  const sharedMaterials = new Set<THREE.Material>(Object.values(shared));
  const sharedTextures = new Set<THREE.Texture>([...sharedMaterials].flatMap(texturesOf));
  const materials = new Set<THREE.Material>();
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
  });
  for (const material of materials) {
    if (sharedMaterials.has(material)) continue;
    for (const texture of texturesOf(material)) if (!sharedTextures.has(texture)) texture.dispose();
    material.dispose();
  }
  group.removeFromParent();
}
