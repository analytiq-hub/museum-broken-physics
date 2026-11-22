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
import { CAMERA_POSES, buildSidewaysGravityView } from "./exhibits/sideways-gravity/view";
import { installDebugApi } from "./debug/api";
import { Recorder } from "./debug/recorder";
import { GRAVITY_KEYS, createGravityPanel } from "./ui/gravityPanel";
import "./style.css";

const R = await initPhysics();

const params = new URLSearchParams(location.search);
/** `?debug` shows the FPS meter and the lil-gui debug panel. */
const DEBUG = params.has("debug");

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
camera.position.set(...CAMERA_POSES.window.position);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(...CAMERA_POSES.window.target);
controls.enableDamping = true;

// --- Exhibit -------------------------------------------------------------------
const exhibit = new SidewaysGravityExhibit(R);
const sync = new BodySync();
const view = buildSidewaysGravityView(scene, exhibit, sync);

/** `?paused` starts with the simulation stopped (for automation via window.__game). */
let paused = params.has("paused");
let failedFor = 0;
const recorder = new Recorder(exhibit.id);
const ballPosition = () => exhibit.describe().bodies.ball.pos;

function stepOnce(): void {
  sync.beforeStep();
  exhibit.step();
  sync.afterStep();
  if (exhibit.isSolved()) recorder.finish("solved", exhibit.stepCount, ballPosition());
  else if (exhibit.isFailed()) recorder.finish("failed", exhibit.stepCount, ballPosition());
}
const stepper = new FixedStepper(FIXED_DT, stepOnce);

function reset(): void {
  recorder.reset(exhibit.stepCount, ballPosition());
  exhibit.reset();
  sync.rebind(exhibit.world);
  stepper.clear();
  failedFor = 0;
}

/** Every rule change goes through here, so the recorder sees it. */
function changeRule(id: string, value: unknown): boolean {
  const changed = exhibit.setRule(id, value);
  if (changed) recorder.change(exhibit.stepCount, id, value);
  return changed;
}

function setGravity(direction: GravityDirection): void {
  changeRule("gravity", direction);
}

/** Saves this session's attempts as JSON, to drop into tests/replays/. */
function downloadRecording(): void {
  const blob = new Blob([JSON.stringify(recorder.toJSON(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `recording-${exhibit.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// --- HUD and gravity controls ---------------------------------------------------
const hud = document.createElement("div");
hud.className = "hud";
document.body.appendChild(hud);
const panel = createGravityPanel(GRAVITY_LABELS, setGravity);

let lastHud = "";
function renderHud(): void {
  const gravity = exhibit.rule("gravity").current as GravityDirection;
  let status = "Get the marble onto the brass plate.";
  if (exhibit.isSolved()) status = "Solved! The door is open.";
  else if (exhibit.isFailed()) status = "The marble fell to the floor and can't climb back up. Resetting…";
  else if (exhibit.changesLeft === 0) status = "Out of gravity changes. Press R to try again.";
  const pips = "●".repeat(exhibit.changesLeft) + "○".repeat(exhibit.changesUsed);
  const html = `
    <div class="title">The Sideways Gallery</div>
    <div>Gravity in this gallery is broken. Right now everything falls toward the <b>${GRAVITY_LABELS[gravity].toLowerCase()}</b>.</div>
    <div><b>Changes left</b> <span class="pips">${pips}</span></div>
    <div class="status">${status}</div>
    <div class="keys">R reset</div>`;
  if (html !== lastHud) hud.innerHTML = lastHud = html;
  panel.update({
    current: gravity,
    enabled: exhibit.changesLeft > 0 && !exhibit.isSolved() && !exhibit.isFailed(),
  });
}

// --- Debug UI ------------------------------------------------------------------
const stats = new Stats();
if (DEBUG) document.body.appendChild(stats.dom);

const gui = new GUI({ title: "Debug" });
gui.show(DEBUG);
const debug = {
  gravity: exhibit.rule("gravity").current as GravityDirection,
  paused,
  reset,
  step: () => stepper.advance(FIXED_DT),
  downloadRecording,
};
gui
  .add(debug, "gravity", Object.fromEntries(GRAVITY_OPTIONS.map((g) => [GRAVITY_LABELS[g], g])))
  .name("Gravity")
  .onChange((g: GravityDirection) => setGravity(g))
  .listen();
gui.add(debug, "paused").name("Pause (P)").onChange((v: boolean) => (paused = v)).listen();
gui.add(debug, "step").name("Step once (.)");
gui.add(debug, "reset").name("Reset (R)");
gui.add(debug, "downloadRecording").name("Download recording (Shift+D)");

window.addEventListener("keydown", (e) => {
  const direction = GRAVITY_KEYS[e.key];
  if (direction) {
    e.preventDefault(); // arrows and space would otherwise scroll or press focused buttons
    setGravity(direction);
  }
  if (e.key === "D" && e.shiftKey) downloadRecording();
  if (e.key === "r" || e.key === "R") reset();
  if (e.key === "p" || e.key === "P") debug.paused = paused = !paused;
  if (e.key === ".") debug.step();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Debug API (window.__game) ----------------------------------------------------
installDebugApi({
  getState: () => exhibit.describe(),
  setRule: changeRule,
  getRecording: () => recorder.toJSON(),
  step(n = 1) {
    for (let i = 0; i < n; i++) stepOnce();
  },
  settle(maxSteps = 600) {
    let n = 0;
    while (n < maxSteps && !exhibit.isSettled() && !exhibit.isFailed()) {
      stepOnce();
      n++;
    }
    return n;
  },
  reset,
  setPaused(value) {
    debug.paused = paused = value;
  },
  cameras: Object.keys(CAMERA_POSES),
  setCamera(name) {
    const pose = CAMERA_POSES[name as keyof typeof CAMERA_POSES];
    if (!pose) throw new Error(`unknown camera "${name}"`);
    camera.position.set(...pose.position);
    controls.target.set(...pose.target);
    controls.update();
  },
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
