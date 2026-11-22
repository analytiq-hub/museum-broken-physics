// Post-processing: a subtle bloom on brass highlights and lamps, then tone
// mapping and colour-space output. `?quality=low` skips bloom.
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

export interface Post {
  render(): void;
  setSize(width: number, height: number): void;
}

export function createPost(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  bloom: boolean,
): Post {
  if (!bloom) {
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => {},
    };
  }
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  // Half-resolution bloom keeps the cost low; high threshold so only real highlights glow.
  const size = renderer.getSize(new THREE.Vector2());
  const bloomPass = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.18, 0.4, 1.0);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
  return {
    render: () => composer.render(),
    setSize(width, height) {
      composer.setSize(width, height);
      bloomPass.resolution.set(width / 2, height / 2);
    },
  };
}
