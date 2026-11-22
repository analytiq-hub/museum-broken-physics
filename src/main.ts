// Browser entry point: renderer, fixed-timestep loop, first-person player,
// console interaction, HUD and debug controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GUI } from "lil-gui";
import Stats from "stats.js";
import { BodySync } from "./engine/bodySync";
import { FixedStepper } from "./engine/loop";
import { FIXED_DT, initPhysics } from "./engine/physics";
import { PLAYER, Player, type PlayerInput } from "./engine/player";
import type { GravityDirection } from "./rules/Rule";
import {
  DOORWAY_X,
  EXIT_X,
  RESET_SPOT,
  GRAVITY_LABELS,
  GRAVITY_OPTIONS,
  PLAYER_SPAWN,
  SidewaysGravityExhibit,
} from "./exhibits/sideways-gravity/sim";
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
/** How far away (m) a console button can be pressed from. */
const REACH = 2.6;

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

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 100);
camera.rotation.order = "YXZ";

/**
 * "first-person": the player walks the gallery (default).
 * "orbit": a fixed or orbiting debug view (screenshots, the old view through the window).
 */
type CameraMode = "first-person" | "orbit";
let mode: CameraMode = "first-person";

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.enabled = false;
const look = new PointerLockControls(camera, renderer.domElement);

// --- Exhibit and player ----------------------------------------------------------
const exhibit = new SidewaysGravityExhibit(R);
const sync = new BodySync();
const view = buildSidewaysGravityView(scene, exhibit, sync);
const player = new Player(R, PLAYER_SPAWN);
player.attach(exhibit.world);
camera.rotation.set(-0.08, 0, 0); // facing the window, eyes slightly lowered

/**
 * `?automation` (screenshots, scripts): no click-to-play overlay,
 * and the UI behaves as if the pointer were locked (crosshair, hover hints).
 */
const AUTOMATION = params.has("automation");
/** `?paused` starts with the simulation stopped (drive it via window.__game). */
let paused = params.has("paused");
const pointerLocked = () => look.isLocked || AUTOMATION;
let failedFor = 0;
const recorder = new Recorder(exhibit.id, () => player.getState());
const ballPosition = () => exhibit.describe().bodies.ball.pos;

const keys = new Set<string>();
/** 1 if any of the key codes is held, else 0. */
const held = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);
function playerInput(): PlayerInput {
  if (mode !== "first-person") return { forward: 0, right: 0, yaw: camera.rotation.y };
  return {
    forward: held("KeyW", "ArrowUp") - held("KeyS", "ArrowDown"),
    right: held("KeyD", "ArrowRight") - held("KeyA", "ArrowLeft"),
    yaw: camera.rotation.y,
  };
}

function stepOnce(): void {
  const input = playerInput();
  recorder.input(exhibit.stepCount, input);
  player.step(input, FIXED_DT);
  sync.beforeStep();
  exhibit.step();
  sync.afterStep();
  if (exhibit.isSolved()) recorder.finish("solved", exhibit.stepCount, ballPosition());
  else if (exhibit.isFailed()) recorder.finish("failed", exhibit.stepCount, ballPosition());
}
const stepper = new FixedStepper(FIXED_DT, stepOnce);

function reset(): void {
  recorder.endAttempt(exhibit.stepCount, ballPosition());
  player.detach();
  if (player.feet.x < DOORWAY_X) player.placeAt(RESET_SPOT); // the door is about to close
  exhibit.reset();
  player.attach(exhibit.world);
  recorder.beginAttempt();
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

// --- Looking at the console ------------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.far = REACH;
const screenCentre = new THREE.Vector2(0, 0);
let hovered: GravityDirection | undefined;

function updateHover(): void {
  hovered = undefined;
  if (mode === "first-person") {
    raycaster.setFromCamera(screenCentre, camera);
    const hit = raycaster.intersectObjects(view.buttons, false)[0];
    hovered = hit?.object.userData.gravity as GravityDirection | undefined;
  }
  view.setHovered(hovered);
}

// --- HUD, crosshair, gravity panel, click-to-play overlay ---------------------------
const hud = document.createElement("div");
hud.className = "hud";
document.body.appendChild(hud);
const panel = createGravityPanel(GRAVITY_LABELS, setGravity);

const crosshair = document.createElement("div");
crosshair.className = "crosshair";
crosshair.innerHTML = `<div class="dot"></div><div class="hint"></div>`;
document.body.appendChild(crosshair);
const crosshairHint = crosshair.querySelector<HTMLDivElement>(".hint")!;

const overlay = document.createElement("div");
overlay.className = "overlay";
overlay.innerHTML = `
  <div class="card">
    <h1>The Museum of Broken Physics</h1>
    <p>Gallery 1: <b>The Sideways Gallery</b></p>
    <p class="controls"><b>Click</b> to enter · <b>WASD</b> walk · <b>Mouse</b> look ·
      <b>Click</b> a brass button on the console to change gravity · <b>R</b> reset · <b>Esc</b> pause</p>
  </div>`;
overlay.addEventListener("click", () => look.lock());
document.body.appendChild(overlay);
if (AUTOMATION) overlay.classList.add("hidden");
look.addEventListener("lock", () => overlay.classList.add("hidden"));
look.addEventListener("unlock", () => {
  keys.clear();
  if (mode === "first-person" && !AUTOMATION) overlay.classList.remove("hidden");
});

renderer.domElement.addEventListener("mousedown", () => {
  if (pointerLocked() && hovered) setGravity(hovered);
});

let lastHud = "";
function renderHud(): void {
  const gravity = exhibit.rule("gravity").current as GravityDirection;
  const canChange = exhibit.changesLeft > 0 && !exhibit.isSolved() && !exhibit.isFailed();
  let status = "Get the marble onto the brass plate. The gravity console is just inside the doorway.";
  if (exhibit.isSolved() && player.position.x < EXIT_X) status = "You made it through the Sideways Gallery. More galleries coming soon.";
  else if (exhibit.isSolved()) status = "Solved! The door on the left wall is open.";
  else if (exhibit.isFailed()) status = "The marble fell to the floor and can't climb back up. Resetting…";
  else if (exhibit.changesLeft === 0) status = "Out of gravity changes. Press R to try again.";
  const pips = "●".repeat(exhibit.changesLeft) + "○".repeat(exhibit.changesUsed);
  const html = `
    <div class="title">The Sideways Gallery</div>
    <div>Gravity in this gallery is broken. Right now everything falls toward the <b>${GRAVITY_LABELS[gravity].toLowerCase()}</b>.</div>
    <div><b>Changes left</b> <span class="pips">${pips}</span></div>
    <div class="status">${status}</div>`;
  if (html !== lastHud) hud.innerHTML = lastHud = html;

  panel.setVisible(mode === "orbit");
  panel.update({ current: gravity, enabled: canChange });

  const showCrosshair = mode === "first-person" && pointerLocked();
  crosshair.classList.toggle("hidden", !showCrosshair);
  crosshair.classList.toggle("active", !!hovered);
  crosshairHint.textContent = !hovered
    ? ""
    : hovered === gravity
      ? `${GRAVITY_LABELS[hovered]} (current)`
      : canChange
        ? `Click: gravity toward the ${GRAVITY_LABELS[hovered].toLowerCase()}`
        : GRAVITY_LABELS[hovered];
}

// --- Camera modes ----------------------------------------------------------------
function setMode(next: CameraMode): void {
  mode = next;
  orbit.enabled = next === "orbit";
  if (next === "orbit") {
    if (look.isLocked) look.unlock();
    overlay.classList.add("hidden");
  } else {
    camera.rotation.set(camera.rotation.x, camera.rotation.y, 0);
    if (!pointerLocked()) overlay.classList.remove("hidden");
  }
}

function setOrbitPose(name: string): void {
  const pose = CAMERA_POSES[name as keyof typeof CAMERA_POSES];
  if (!pose) throw new Error(`unknown camera "${name}"`);
  setMode("orbit");
  camera.position.set(...pose.position);
  orbit.target.set(...pose.target);
  orbit.update();
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
  firstPerson: () => setMode("first-person"),
  windowView: () => setOrbitPose("window"),
};
gui
  .add(debug, "gravity", Object.fromEntries(GRAVITY_OPTIONS.map((g) => [GRAVITY_LABELS[g], g])))
  .name("Gravity")
  .onChange((g: GravityDirection) => setGravity(g))
  .listen();
gui.add(debug, "paused").name("Pause (P)").onChange((v: boolean) => (paused = v)).listen();
gui.add(debug, "step").name("Step once (.)");
gui.add(debug, "reset").name("Reset (R)");
gui.add(debug, "firstPerson").name("First person (C)");
gui.add(debug, "windowView").name("View through window (C)");
gui.add(debug, "downloadRecording").name("Download recording (Shift+D)");

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  // In the window view, arrows and Space set gravity like the on-screen d-pad.
  const direction = mode === "orbit" ? GRAVITY_KEYS[e.key] : undefined;
  if (direction) {
    e.preventDefault();
    setGravity(direction);
  } else if (e.code.startsWith("Arrow") || e.code === "Space") {
    e.preventDefault(); // don't scroll
  }
  if (e.key === "D" && e.shiftKey) downloadRecording();
  else if (e.key === "r" || e.key === "R") reset();
  if (e.key === "p" || e.key === "P") debug.paused = paused = !paused;
  if (e.key === ".") debug.step();
  if (e.key === "c" || e.key === "C") {
    if (mode === "orbit") setMode("first-person");
    else setOrbitPose("window");
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

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
  cameras: [...Object.keys(CAMERA_POSES), "player"],
  setCamera(name) {
    if (name === "player") setMode("first-person");
    else setOrbitPose(name);
  },
  setPlayer(feet, yaw, pitch = 0) {
    player.placeAt({ x: feet.x, y: feet.y ?? 0, z: feet.z });
    camera.rotation.set(pitch, yaw, 0);
    setMode("first-person");
  },
  setLook(yaw, pitch) {
    camera.rotation.set(pitch, yaw, 0);
  },
  lookAtButton(direction) {
    const button = view.buttons.find((b) => b.userData.gravity === direction);
    if (!button) throw new Error(`no console button "${direction}"`);
    const d = button.getWorldPosition(new THREE.Vector3()).sub(camera.position);
    camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0);
  },
  getPlayer: () => ({ feet: player.feet, yaw: camera.rotation.y, pitch: camera.rotation.x, hovered }),
});

// --- Frame loop ------------------------------------------------------------------
const clock = new THREE.Timer();
const eye = new THREE.Vector3();
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

  sync.render(alpha);
  if (mode === "first-person") {
    const p = player.previous;
    const q = player.position;
    const feetOffset = PLAYER.eyeHeight - (PLAYER.halfHeight + PLAYER.radius);
    eye.set(p.x + (q.x - p.x) * alpha, p.y + (q.y - p.y) * alpha + feetOffset, p.z + (q.z - p.z) * alpha);
    camera.position.copy(eye);
  } else {
    orbit.update();
  }
  updateHover();
  debug.gravity = exhibit.rule("gravity").current as GravityDirection;
  view.update(frameDt);
  renderHud();
  renderer.render(scene, camera);
  stats.end();
});
