// A museum placard: a cream card in a wooden frame, its text drawn on a canvas.
import * as THREE from "three";
import type { Materials } from "./materials";

export interface PlacardText {
  kicker: string;
  title: string;
  lines: string[];
}

export function placard(text: PlacardText, at: THREE.Vector3, rotationY: number, m: Materials): THREE.Mesh {
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
