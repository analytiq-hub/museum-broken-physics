// Browser entry point: renderer, fixed-timestep loop, first-person player,
// the galleries (each with its own physics world; the player is handed between
// them in the corridor), interaction, HUD and debug controls.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GUI } from "lil-gui";
import Stats from "stats.js";
import { Sound } from "./audio/sound";
import { installDebugApi } from "./debug/api";
import { FixedStepper } from "./engine/loop";
import { FIXED_DT, initPhysics } from "./engine/physics";
import { PLAYER, Player, type PlayerInput } from "./engine/player";
import { HANDOVER_MARGIN } from "./exhibits/layout";
import { PLAYER_SPAWN } from "./exhibits/sideways-gravity/sim";
import type { Gallery, Interactable } from "./galleries/gallery";
import { createLeaningGallery } from "./galleries/leaningGallery";
import { createPendulumGallery } from "./galleries/pendulumGallery";
import { createSidewaysGallery } from "./galleries/sidewaysGallery";
import { loadEnvironment, loadMaterials } from "./render/materials";
import { createPost } from "./render/post";
import type { GravityDirection } from "./rules/Rule";
import { GameState } from "./state/gameState";
import { GRAVITY_KEYS, createInstrument } from "./ui/instrument";
import { instrumentModel } from "./ui/instrumentModel";
import "./style.css";

const R = await initPhysics();

const params = new URLSearchParams(location.search);
/** `?debug` shows the FPS meter and the lil-gui debug panel. */
const DEBUG = params.has("debug");
/** `?quality=low`: no bloom, smaller shadow map, pixel ratio 1 (slow machines). */
const LOW_QUALITY = params.get("quality") === "low";
/**
 * `?automation` (screenshots, scripts): no click-to-play overlay,
 * and the UI behaves as if the pointer were locked (crosshair, hover hints).
 */
const AUTOMATION = params.has("automation");
/** Seconds the failed state stays on screen before the room resets itself. */
const AUTO_RESET_SECONDS = 2.5;
/** How far away (m) a console button can be pressed from. */
const REACH = 2.6;

// --- Renderer, scene, camera -------------------------------------------------
const app = document.querySelector<HTMLDivElement>("#app")!;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(LOW_QUALITY ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.info.autoReset = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x15130f);
// Procedural reflections until the HDRI has loaded (it replaces this).
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.45;
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a241c, 0.25));
const materials = await loadMaterials(renderer);
const environmentReady = loadEnvironment(renderer, scene).catch((e) => console.warn("HDRI failed to load", e));

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 100);
camera.rotation.order = "YXZ";

/**
 * "first-person": the player walks the museum (default).
 * "orbit": a fixed or orbiting debug view (screenshots, the view through the window).
 */
type CameraMode = "first-person" | "orbit";
let mode: CameraMode = "first-person";

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.enabled = false;
const look = new PointerLockControls(camera, renderer.domElement);

// --- Player and galleries ----------------------------------------------------------
const sound = new Sound();
const gameState = new GameState();
const player = new Player(R, PLAYER_SPAWN);
const galleries: Gallery[] = [
  createSidewaysGallery(R, scene, materials, sound, () => player),
  createPendulumGallery(R, scene, materials, sound, () => player),
  createLeaningGallery(R, scene, materials, sound, () => player),
];
let active = galleries[0];
player.attach(active.exhibit.world);
camera.rotation.set(-0.08, 0, 0); // facing the window, eyes slightly lowered

if (LOW_QUALITY) {
  scene.traverse((o) => {
    if (o instanceof THREE.SpotLight && o.castShadow) o.shadow.mapSize.set(1024, 1024);
  });
}
const post = createPost(renderer, scene, camera, !LOW_QUALITY);

/** `?paused` starts with the simulation stopped (drive it via window.__game). */
let paused = params.has("paused");
const pointerLocked = () => look.isLocked || AUTOMATION;
let failedFor = 0;
/** Distance walked since the last footstep (m). */
let stride = 0;
/** Position of the gallery's main body (ball, bob), recorded at the end of attempts. */
const primaryPosition = (g: Gallery) => Object.values(g.exhibit.describe().bodies)[0].pos;

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

/** Moves the player into another gallery's physics world. Only the active world steps. */
function switchTo(next: Gallery): void {
  if (next === active) return;
  active.silence();
  player.detach();
  active = next;
  player.attach(active.exhibit.world);
  active.recorder.playerArrived(active.exhibit.stepCount);
  failedFor = 0;
}

/** Hands the player over if they crossed into another gallery's side of the museum. */
function checkHandover(margin = HANDOVER_MARGIN): void {
  const x = player.feet.x;
  if (active.owns(x, margin)) return;
  const next = galleries.find((g) => g !== active && g.owns(x, -margin));
  if (next) switchTo(next);
}

function stepOnce(): void {
  const g = active;
  const ex = g.exhibit;
  const input = playerInput();
  g.recorder.input(ex.stepCount, input);
  player.step(input, FIXED_DT);
  if (player.grounded) stride += Math.hypot(player.position.x - player.previous.x, player.position.z - player.previous.z);
  g.sync.beforeStep();
  ex.step();
  g.sync.afterStep();
  g.afterStep();
  if (ex.isSolved()) {
    g.recorder.finish("solved", ex.stepCount, primaryPosition(g));
    gameState.markSolved(g.id, ex.describe().rules);
  } else if (ex.isFailed()) {
    g.recorder.finish("failed", ex.stepCount, primaryPosition(g));
  }
  checkHandover();
}
const stepper = new FixedStepper(FIXED_DT, stepOnce);

/** Resets the gallery the player is in. Other galleries keep their state. */
function reset(): void {
  const g = active;
  g.recorder.endAttempt(g.exhibit.stepCount, primaryPosition(g));
  player.detach();
  g.beforeReset(player);
  g.exhibit.reset();
  player.attach(g.exhibit.world);
  g.recorder.beginAttempt();
  g.sync.rebind(g.exhibit.world);
  stepper.clear();
  failedFor = 0;
  g.afterReset();
}

/** Every rule change goes through here, so the recorder sees it. */
function changeRule(id: string, value: unknown): boolean {
  const g = active;
  const changed = g.exhibit.setRule(id, value);
  if (changed) {
    g.recorder.change(g.exhibit.stepCount, id, value);
    sound.click();
    if (id === "gravity") sound.gravityShift();
  }
  return changed;
}

/** Saves this gallery's attempts as JSON, to drop into tests/replays/. */
function downloadRecording(): void {
  const blob = new Blob([JSON.stringify(active.recorder.toJSON(), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `recording-${active.id}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Debug: jump to a gallery's entrance. */
function goToGallery(g: Gallery): void {
  player.placeAt(g.entrance);
  camera.rotation.set(-0.05, g.entranceYaw, 0);
  checkHandover(0);
}

// --- Looking at in-world controls --------------------------------------------------
const raycaster = new THREE.Raycaster();
raycaster.far = REACH;
const screenCentre = new THREE.Vector2(0, 0);
let hovered: Interactable | undefined;

function updateHover(): void {
  hovered = undefined;
  if (mode === "first-person" && active.interactables.length) {
    raycaster.setFromCamera(screenCentre, camera);
    const hit = raycaster.intersectObjects(active.interactables, false)[0];
    hovered = hit?.object.userData.interact as Interactable | undefined;
  }
  active.setHovered(hovered);
}

// --- HUD, crosshair, instrument, click-to-play overlay -------------------------------
const hud = document.createElement("div");
hud.className = "hud";
document.body.appendChild(hud);
const instrument = createInstrument({
  setRule: (id, value) => changeRule(id, value),
  resetRoom: () => reset(),
});
/** First person: the instrument is up while Q is held. */
let instrumentHeld = false;

function raiseInstrument(): void {
  instrumentHeld = true;
  look.enabled = false; // the mouse now drives the instrument's cursor, not the view
}
function lowerInstrument(): void {
  instrumentHeld = false;
  look.enabled = true;
  if (mode === "first-person") instrument.close();
}

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
    <p>Three galleries whose laws have broken. Put them right, or put them to use.</p>
    <p class="controls"><b>Click</b> to enter · <b>WASD</b> walk · <b>Mouse</b> look ·
      <b>Click</b> brass buttons to work the exhibits · hold <b>Q</b> for your physics instrument ·
      <b>R</b> reset the room · <b>M</b> mute · <b>Esc</b> pause</p>
  </div>`;
overlay.addEventListener("click", () => {
  sound.unlock();
  look.lock();
});
// Audio may only start after a gesture; any key or click will do.
window.addEventListener("pointerdown", () => sound.unlock());
document.body.appendChild(overlay);
if (AUTOMATION) overlay.classList.add("hidden");
look.addEventListener("lock", () => overlay.classList.add("hidden"));
look.addEventListener("unlock", () => {
  keys.clear();
  lowerInstrument();
  if (mode === "first-person" && !AUTOMATION) overlay.classList.remove("hidden");
});

document.addEventListener("mousedown", () => {
  if (instrument.usesVirtualCursor) instrument.click();
  else if (pointerLocked() && hovered && !instrument.isOpen) changeRule(hovered.rule, hovered.value);
});
document.addEventListener("mousemove", (e) => {
  if (instrument.usesVirtualCursor) instrument.moveCursor(e.movementX, e.movementY);
});

/** Arrow keys + Space set gravity only where they match the room (Gallery I's five directions). */
const KEYED_DIRECTIONS = new Set(Object.values(GRAVITY_KEYS));
const gravityEditable = () =>
  active.exhibit.rules.some(
    (r) => r.id === "gravity" && r.editable && (r.options ?? []).every((o) => KEYED_DIRECTIONS.has(o.value as GravityDirection)),
  );

let lastHud = "";
function renderHud(): void {
  const ex = active.exhibit;
  const canChange = ex.changesLeft > 0 && !ex.isSolved() && !ex.isFailed();
  const pips = "●".repeat(ex.changesLeft) + "○".repeat(ex.changesUsed);
  const hint = mode === "first-person" ? "Hold <b>Q</b> to read the room's laws with your instrument." : "";
  const restored = galleries.filter((g) => gameState.isSolved(g.id)).length;
  const html = `
    <div class="title">${active.title}</div>
    <div>${active.summary()} · Changes left <span class="pips">${pips}</span></div>
    <div class="status">${active.status(player)}</div>
    <div class="keys">Galleries restored: ${restored} of ${galleries.length}${hint ? ` · ${hint}` : ""}</div>`;
  if (html !== lastHud) hud.innerHTML = lastHud = html;

  // The instrument: pinned open in the window view, raised with Q in first person.
  instrument.update(instrumentModel(ex, active.title));
  if (mode === "orbit") instrument.open(false, gravityEditable() ? "Arrow keys and Space set gravity too" : "");
  else if (instrumentHeld) instrument.open(look.isLocked, look.isLocked ? "Move the mouse to point · release Q to put away" : "Release Q to put away");
  else instrument.close();

  const showCrosshair = mode === "first-person" && pointerLocked() && !instrument.isOpen;
  crosshair.classList.toggle("hidden", !showCrosshair);
  crosshair.classList.toggle("active", !!hovered);
  let text = "";
  if (hovered) {
    const current = ex.rule(hovered.rule).current === hovered.value;
    const action = hovered.rule === "gravity" ? `gravity toward the ${hovered.label.toLowerCase()}` : hovered.label;
    text = current ? `${hovered.label} (current)` : canChange ? `Click: ${action}` : hovered.label;
  }
  crosshairHint.textContent = text;
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

/** An orbit pose from any gallery; makes that gallery active (moving the player to it). */
function setOrbitPose(name: string): void {
  const owner = galleries.find((g) => name in g.cameraPoses);
  if (!owner) throw new Error(`unknown camera "${name}"`);
  if (owner !== active) goToGallery(owner);
  const pose = owner.cameraPoses[name];
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
  paused,
  reset,
  step: () => stepper.advance(FIXED_DT),
  downloadRecording,
  firstPerson: () => setMode("first-person"),
  windowView: () => setOrbitPose("window"),
  gallery1: () => goToGallery(galleries[0]),
  gallery2: () => goToGallery(galleries[1]),
  gallery3: () => goToGallery(galleries[2]),
};
gui.add(debug, "paused").name("Pause (P)").onChange((v: boolean) => (paused = v)).listen();
gui.add(debug, "step").name("Step once (.)");
gui.add(debug, "reset").name("Reset room (R)");
gui.add(debug, "firstPerson").name("First person (C)");
gui.add(debug, "windowView").name("View through window (C)");
gui.add(debug, "gallery1").name("Go to Gallery I");
gui.add(debug, "gallery2").name("Go to Gallery II");
gui.add(debug, "gallery3").name("Go to Gallery III");
gui.add(debug, "downloadRecording").name("Download recording (Shift+D)");

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  sound.unlock();
  if (e.code === "KeyM") sound.setMuted(!sound.isMuted);
  if (e.code === "KeyQ" && !e.repeat && mode === "first-person") raiseInstrument();
  // In the window view, arrows and Space set gravity like the instrument's pad.
  const direction: GravityDirection | undefined = mode === "orbit" && gravityEditable() ? GRAVITY_KEYS[e.key] : undefined;
  if (direction) {
    e.preventDefault();
    changeRule("gravity", direction);
  } else if (e.code.startsWith("Arrow") || e.code === "Space") {
    e.preventDefault(); // don't scroll
  }
  if (e.key === "D" && e.shiftKey) downloadRecording();
  else if (e.key === "r" || e.key === "R") reset();
  if (e.key === "p" || e.key === "P") debug.paused = paused = !paused;
  if (e.key === ".") debug.step();
  if (e.key === "c" || e.key === "C") {
    if (mode === "orbit") setMode("first-person");
    else setOrbitPose(Object.keys(active.cameraPoses)[0]);
  }
});
window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "KeyQ") lowerInstrument();
});
window.addEventListener("blur", () => {
  keys.clear();
  lowerInstrument();
});

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  post.setSize(window.innerWidth, window.innerHeight);
});

// --- Debug API (window.__game) ----------------------------------------------------
installDebugApi({
  ready: environmentReady.then(() => undefined),
  getState: () => active.exhibit.describe(),
  setRule: changeRule,
  getRecording: () => active.recorder.toJSON(),
  step(n = 1) {
    for (let i = 0; i < n; i++) stepOnce();
  },
  settle(maxSteps = 600) {
    let n = 0;
    while (n < maxSteps && !active.exhibit.isSettled() && !active.exhibit.isFailed()) {
      stepOnce();
      n++;
    }
    return n;
  },
  reset,
  setPaused(value) {
    debug.paused = paused = value;
  },
  cameras: [...galleries.flatMap((g) => Object.keys(g.cameraPoses)), "player"],
  setCamera(name) {
    if (name === "player") setMode("first-person");
    else setOrbitPose(name);
  },
  setPlayer(feet, yaw, pitch = 0) {
    player.placeAt({ x: feet.x, y: feet.y ?? 0, z: feet.z });
    camera.rotation.set(pitch, yaw, 0);
    checkHandover(0);
    setMode("first-person");
  },
  setLook(yaw, pitch) {
    camera.rotation.set(pitch, yaw, 0);
  },
  setInstrument(open) {
    if (open) raiseInstrument();
    else lowerInstrument();
  },
  lookAtButton(value) {
    const button = active.interactables.find((b) => (b.userData.interact as Interactable).value === value);
    if (!button) throw new Error(`no button "${value}" in ${active.id}`);
    const d = button.getWorldPosition(new THREE.Vector3()).sub(camera.position);
    camera.rotation.set(Math.atan2(d.y, Math.hypot(d.x, d.z)), Math.atan2(-d.x, -d.z), 0);
  },
  getRenderInfo: () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  getPlayer: () => ({
    feet: player.feet,
    yaw: camera.rotation.y,
    pitch: camera.rotation.x,
    hovered: hovered === undefined ? undefined : String(hovered.value),
    gallery: active.id,
  }),
  getGameState: () => gameState.toJSON(),
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

  if (active.exhibit.isFailed() && !paused) {
    failedFor += frameDt;
    if (failedFor > AUTO_RESET_SECONDS) reset();
  }

  // Inactive galleries don't step, so draw them exactly at their last step.
  for (const g of galleries) g.sync.render(g === active ? alpha : 1);
  if (mode === "first-person") {
    const p = player.previous;
    const q = player.position;
    const feetOffset = PLAYER.eyeHeight - (PLAYER.halfHeight + PLAYER.radius);
    eye.set(p.x + (q.x - p.x) * alpha, p.y + (q.y - p.y) * alpha + feetOffset, p.z + (q.z - p.z) * alpha);
    const shake = paused ? 0 : active.shake();
    if (shake > 0) eye.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    camera.position.copy(eye);
  } else {
    orbit.update();
  }
  updateHover();
  active.update(frameDt);
  if (stride > 0.7) {
    sound.footstep();
    stride = 0;
  }
  renderHud();
  renderer.info.reset(); // counted per frame (post-processing renders several passes)
  post.render();
  stats.end();
});
