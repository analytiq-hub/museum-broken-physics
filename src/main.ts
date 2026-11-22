// Browser entry point: renderer, fixed-timestep loop, debug controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import GUI from "lil-gui";
import Stats from "stats.js";
import { BodySync } from "./engine/bodySync";
import { FixedStepper } from "./engine/loop";
import { FIXED_DT, initPhysics } from "./engine/physics";
import { buildFallingCubeSim } from "./exhibits/falling-cube/sim";
import { buildFallingCubeView } from "./exhibits/falling-cube/view";
import "./style.css";

const R = await initPhysics();

// --- Renderer, scene, camera -------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15130f);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(6, 4, 8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;

// --- Lights --------------------------------------------------------------------
// Placeholder reflections so metals (brass) aren't black; an HDR map replaces this in the visual pass.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a241c, 0.3));
const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
key.position.set(5, 10, 4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -10;
key.shadow.camera.right = key.shadow.camera.top = 10;
scene.add(key);

// --- Simulation + view ---------------------------------------------------------
let sim = buildFallingCubeSim(R);
const initialSnapshot = sim.world.takeSnapshot();
const sync = new BodySync();
buildFallingCubeView(scene, sim, sync);

let paused = false;
const stepper = new FixedStepper(FIXED_DT, () => {
  sync.beforeStep();
  sim.world.step();
  sync.afterStep();
});

function reset(): void {
  const world = R.World.restoreSnapshot(initialSnapshot);
  sim.world.free();
  sim = { world, floor: world.getRigidBody(sim.floor.handle), cube: world.getRigidBody(sim.cube.handle) };
  sync.rebind(world);
  stepper.clear();
}

// --- Debug UI --------------------------------------------------------------------
const stats = new Stats();
document.body.appendChild(stats.dom);

const gui = new GUI({ title: "Debug" });
const debug = {
  paused,
  reset,
  step: () => stepper.advance(FIXED_DT),
};
gui.add(debug, "paused").name("Pause (P)").onChange((v: boolean) => (paused = v)).listen();
gui.add(debug, "step").name("Step once (.)");
gui.add(debug, "reset").name("Reset (R)");

window.addEventListener("keydown", (e) => {
  if (e.key === "r" || e.key === "R") reset();
  if (e.key === "p" || e.key === "P") debug.paused = paused = !paused;
  if (e.key === ".") debug.step();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Frame loop ------------------------------------------------------------------
const clock = new THREE.Timer();
renderer.setAnimationLoop((time) => {
  stats.begin();
  clock.update(time);
  const frameDt = clock.getDelta();
  // Paused: show the latest step exactly, so "Step once" is visible immediately.
  const alpha = paused ? 1 : stepper.advance(frameDt);
  sync.render(alpha);
  controls.update();
  renderer.render(scene, camera);
  stats.end();
});
