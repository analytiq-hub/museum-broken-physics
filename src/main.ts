// Browser entry point: renderer, fixed-timestep loop, HUD and debug controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GUI } from "lil-gui";
import Stats from "stats.js";
import { BodySync } from "./engine/bodySync";
import { FixedStepper } from "./engine/loop";
import { FIXED_DT, initPhysics } from "./engine/physics";
import type { GravityDirection } from "./rules/Rule";
import { GRAVITY_LABELS, GRAVITY_OPTIONS, SidewaysGravityExhibit } from "./exhibits/sideways-gravity/sim";
import { buildSidewaysGravityView } from "./exhibits/sideways-gravity/view";
import "./style.css";

const R = await initPhysics();

/** Seconds the failed state stays on screen before the room resets itself. */
const AUTO_RESET_SECONDS = 2.5;

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
// Placeholder reflections so metals (brass) aren't black; an HDR map replaces this in the visual pass.
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a241c, 0.4));

// Fixed camera at eye height, looking in through the gallery window (south wall).
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.7, 11);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 2.6, 0);
controls.enableDamping = true;

// --- Exhibit -------------------------------------------------------------------
const exhibit = new SidewaysGravityExhibit(R);
const sync = new BodySync();
const view = buildSidewaysGravityView(scene, exhibit, sync);

let paused = false;
let failedFor = 0;
const stepper = new FixedStepper(FIXED_DT, () => {
  sync.beforeStep();
  exhibit.step();
  sync.afterStep();
});

function reset(): void {
  exhibit.reset();
  sync.rebind(exhibit.world);
  stepper.clear();
  failedFor = 0;
}

function setGravity(direction: GravityDirection): void {
  exhibit.setRule("gravity", direction);
}

// --- HUD -----------------------------------------------------------------------
const hud = document.createElement("div");
hud.className = "hud";
document.body.appendChild(hud);

function renderHud(): void {
  const gravity = exhibit.rule("gravity").current as GravityDirection;
  let status = "Get the marble onto the brass plate.";
  if (exhibit.isSolved()) status = "Solved. The door is open.";
  else if (exhibit.isFailed()) status = "The marble is on the floor and can't climb back. Resetting…";
  else if (exhibit.changesLeft === 0) status = "No gravity changes left. Press R to reset.";
  hud.innerHTML = `
    <div><b>Gravity:</b> ${GRAVITY_LABELS[gravity]}</div>
    <div><b>Changes left:</b> ${exhibit.changesLeft} / ${exhibit.budget}</div>
    <div class="status">${status}</div>
    <div class="keys">${GRAVITY_OPTIONS.map((g, i) => `${i + 1} ${GRAVITY_LABELS[g]}`).join(" · ")} · R reset</div>`;
}

// --- Debug UI ------------------------------------------------------------------
const stats = new Stats();
document.body.appendChild(stats.dom);

const gui = new GUI({ title: "Debug" });
const debug = {
  gravity: exhibit.rule("gravity").current as GravityDirection,
  paused,
  reset,
  step: () => stepper.advance(FIXED_DT),
};
gui
  .add(debug, "gravity", Object.fromEntries(GRAVITY_OPTIONS.map((g) => [GRAVITY_LABELS[g], g])))
  .name("Gravity (1–5)")
  .onChange((g: GravityDirection) => setGravity(g))
  .listen();
gui.add(debug, "paused").name("Pause (P)").onChange((v: boolean) => (paused = v)).listen();
gui.add(debug, "step").name("Step once (.)");
gui.add(debug, "reset").name("Reset (R)");

window.addEventListener("keydown", (e) => {
  const index = Number(e.key) - 1;
  if (index >= 0 && index < GRAVITY_OPTIONS.length) setGravity(GRAVITY_OPTIONS[index]);
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

  if (exhibit.isFailed() && !paused) {
    failedFor += frameDt;
    if (failedFor > AUTO_RESET_SECONDS) reset();
  }

  debug.gravity = exhibit.rule("gravity").current as GravityDirection;
  sync.render(alpha);
  view.update(frameDt);
  renderHud();
  controls.update();
  renderer.render(scene, camera);
  stats.end();
});
