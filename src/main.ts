// Browser entry point: renderer, fixed-timestep loop, first-person player,
// the galleries (each with its own physics world; the player is handed between
// them in the corridor), interaction, HUD and debug controls.
//
// Galleries are streamed: only the room the player is in and its two neighbours
// are built (src/galleries/rooms.ts lists them all). Walking into a room loads the
// one beyond it and frees the one two rooms back.
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
import { GALLERIES, OFFSETS, ROOMS, liveAround, roomAt, roomIndex, roomOwns } from "./galleries/rooms";
import { disposeGroup } from "./render/dispose";
import { loadEnvironment, loadMaterials } from "./render/materials";
import { createPost } from "./render/post";
import type { GravityDirection } from "./rules/Rule";
import { GameState } from "./state/gameState";
import { clearProgress, loadProgress, saveProgress, type SavedProgress } from "./state/progress";
import { GRAVITY_KEYS, createInstrument } from "./ui/instrument";
import { instrumentModel } from "./ui/instrumentModel";
import { createTouchControls } from "./ui/touchControls";
import "./style.css";

const R = await initPhysics();

const params = new URLSearchParams(location.search);
/** `?debug` shows the FPS meter and the lil-gui debug panel. */
const DEBUG = params.has("debug");
/**
 * Touch mode (phones, tablets): a joystick to walk, drag to look, tap to use
 * things, on-screen Laws and Reset buttons. On automatically for touchscreens
 * without a mouse; `?touch` forces it (testing on a desktop).
 */
const TOUCH = params.has("touch") || (matchMedia("(pointer: coarse)").matches && !matchMedia("(pointer: fine)").matches);
/**
 * `?quality=low`: no bloom, smaller shadow map, pixel ratio 1 (slow machines).
 * Touch devices default to it; `?quality=high` overrides.
 */
const LOW_QUALITY = params.get("quality") === "low" || (TOUCH && params.get("quality") !== "high");
if (TOUCH) document.body.classList.add("touch");
/**
 * `?automation` (screenshots, scripts): no click-to-play overlay,
 * and the UI behaves as if the pointer were locked (crosshair, hover hints).
 */
const AUTOMATION = params.has("automation");
/** Seconds the failed state stays on screen before the room resets itself. */
const AUTO_RESET_SECONDS = 2.5;
/** How far away (m) a console button can be pressed from. */
const REACH = 2.6;
/** Touch taps reach a little further: there is no crosshair to tell you you're in range. */
const TAP_REACH = 3.4;

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

/** A built gallery, and its lights (switched on and off by distance). */
interface LiveRoom {
  index: number;
  gallery: Gallery;
  lights: THREE.Light[];
}
/** Built rooms by index: never more than three, plus one briefly while a far jump settles. */
const live = new Map<number, LiveRoom>();
const building = new Map<number, Promise<LiveRoom>>();
/** The room the player is in, or heading to (a jump): rooms around it are kept. */
let focus = 0;
let activeIndex = 0;

/** Puts a room solved earlier back as it was left (saved progress, or rebuilt after unloading). */
function restoreRoom(g: Gallery): void {
  g.exhibit.restoreSolved();
  g.sync.rebind(g.exhibit.world);
  g.recorder.skipUntilReset();
  g.afterReset();
}

/** Loads a room's chunk and builds it (once, however many callers ask). */
function buildRoom(index: number): Promise<LiveRoom> {
  const existing = live.get(index);
  if (existing) return Promise.resolve(existing);
  let pending = building.get(index);
  if (!pending) {
    pending = (async () => {
      const factory = await ROOMS[index].load();
      const gallery = factory(R, scene, materials, sound, () => player);
      // Built in its own coordinates; placed in the museum (rooms.ts OFFSETS).
      gallery.group.position.set(OFFSETS[index].x, OFFSETS[index].y, 0);
      // A room rebuilt fresh is like a reset one; if it was solved, show it solved.
      if (gameState.isSolved(gallery.id)) restoreRoom(gallery);
      const lights: THREE.Light[] = [];
      gallery.group.traverse((o) => {
        if (o instanceof THREE.Light) lights.push(o);
        if (LOW_QUALITY && o instanceof THREE.SpotLight && o.castShadow) o.shadow.mapSize.set(1024, 1024);
      });
      // Compile its shaders now, while it is out of sight, not on the frame its door opens.
      await renderer.compileAsync(gallery.group, camera, scene).catch(() => undefined);
      const room: LiveRoom = { index, gallery, lights };
      live.set(index, room);
      building.delete(index);
      return room;
    })();
    building.set(index, pending);
  }
  return pending;
}

/** Frees a room: its physics world, its meshes and textures, its sounds. */
function disposeRoom(room: LiveRoom): void {
  room.gallery.silence();
  room.gallery.exhibit.dispose();
  disposeGroup(room.gallery.group, materials);
  live.delete(room.index);
}

/** Frees every room that is neither around the focus nor the one the player is in. */
function trimRooms(): void {
  const keep = new Set([...liveAround(focus), activeIndex]);
  for (const room of live.values()) if (!keep.has(room.index)) disposeRoom(room); // deleting while iterating a Map is safe
}

/** Builds the rooms around `index` and frees the rest. */
async function ensureAround(index: number): Promise<void> {
  await Promise.all(liveAround(index).map(buildRoom));
  trimRooms();
}

const liveGalleries = () => [...live.values()].map((room) => room.gallery);

let active = (await buildRoom(0)).gallery;
player.attach(active.exhibit.world);
camera.rotation.set(-0.08, 0, 0); // facing the window, eyes slightly lowered
void ensureAround(0);

const post = createPost(renderer, scene, camera, !LOW_QUALITY);

/** `?paused` starts with the simulation stopped (drive it via window.__game). */
let paused = params.has("paused");
/** Touch mode: true once the player has tapped through the start screen. */
let touchEntered = false;
const pointerLocked = () => look.isLocked || AUTOMATION || touchEntered;
let failedFor = 0;
/** Distance walked since the last footstep (m). */
let stride = 0;
/** Position of the gallery's main body (ball, bob), recorded at the end of attempts. */
const primaryPosition = (g: Gallery): [number, number, number] => Object.values(g.exhibit.describe().bodies)[0]?.pos ?? [0, 0, 0];

const keys = new Set<string>();
/** 1 if any of the key codes is held, else 0. */
const held = (...codes: string[]) => (codes.some((c) => keys.has(c)) ? 1 : 0);
const clamp = (v: number) => Math.max(-1, Math.min(1, v));
function playerInput(): PlayerInput {
  if (mode !== "first-person") return { forward: 0, right: 0, yaw: camera.rotation.y };
  return {
    forward: clamp(held("KeyW", "ArrowUp") - held("KeyS", "ArrowDown") + touch.move.forward),
    right: clamp(held("KeyD", "ArrowRight") - held("KeyA", "ArrowLeft") + touch.move.right),
    yaw: camera.rotation.y,
  };
}

/**
 * Moves the player into another (built) gallery's physics world. Only the active
 * world steps. Each room has its own coordinates, so the player is shifted into the
 * new room's, or placed at `local` (a jump).
 */
function switchTo(index: number, local?: { x: number; y: number; z: number }): void {
  const next = live.get(index)?.gallery;
  if (!next) return;
  if (next === active) {
    if (local) player.placeAt(local);
    return;
  }
  active.silence();
  player.detach();
  if (local) player.placeAt(local);
  else player.shift(OFFSETS[activeIndex].x - OFFSETS[index].x, OFFSETS[activeIndex].y - OFFSETS[index].y);
  active = next;
  activeIndex = index;
  focus = index;
  player.attach(active.exhibit.world);
  active.recorder.playerArrived(active.exhibit.stepCount);
  failedFor = 0;
  autosave();
  void ensureAround(index); // load the room beyond, free the one two rooms back
}

// --- Saved progress ---------------------------------------------------------------
/** Progress from an earlier visit in this browser; the start card offers to continue it. */
let savedVisit: SavedProgress | undefined = AUTOMATION ? undefined : loadProgress();
if (savedVisit && !ROOMS.some((room) => savedVisit!.solved[room.id])) savedVisit = undefined; // nothing solved yet
/** Don't overwrite a saved visit until the player has chosen to continue it or start over. */
let progressChosen = !savedVisit;

function autosave(): void {
  if (!AUTOMATION && progressChosen) saveProgress({ solved: gameState.toJSON(), gallery: active.id });
}

/**
 * Puts every gallery solved last time back as it was left, and the player where
 * they were. Rooms built from now on come back solved by themselves (buildRoom).
 */
async function continueVisit(saved: SavedProgress): Promise<void> {
  gameState.load(saved.solved);
  player.detach();
  for (const g of liveGalleries()) if (gameState.isSolved(g.id)) restoreRoom(g);
  player.attach(active.exhibit.world);
  const target = Math.max(0, roomIndex(saved.gallery));
  if (target !== activeIndex) await goToRoom(target);
  stepper.clear();
}

function chooseVisit(fresh: boolean): void {
  if (progressChosen) return;
  progressChosen = true;
  if (fresh) clearProgress();
  else if (savedVisit) void continueVisit(savedVisit);
  savedVisit = undefined;
}

/**
 * Lights cost on every surface in the scene, so only galleries the player can
 * see into are lit: the one they're in, plus any whose doorway is within reach
 * (standing in a corridor lights both ends). Far galleries stay visible, unlit.
 */
const LIGHT_REACH = 10;
/** Galleries further than this (m) can't be seen at all (two rooms away), so aren't drawn. */
const DRAW_REACH = 22;
/** The player's floor position in the museum (the physics runs in the active room's own coordinates). */
function museumFeet(): { x: number; y: number; z: number } {
  const f = player.feet;
  return { x: f.x + OFFSETS[activeIndex].x, y: f.y + OFFSETS[activeIndex].y, z: f.z };
}

function updateGalleryLights(): void {
  const x = museumFeet().x;
  for (const { index, gallery: g, lights } of live.values()) {
    const ox = OFFSETS[index].x;
    const within = (reach: number) => x > g.xRange[0] + ox - reach && x < g.xRange[1] + ox + reach;
    const lit = g === active || within(LIGHT_REACH);
    for (const light of lights) light.visible = lit;
    g.group.visible = g === active || within(DRAW_REACH) || mode === "orbit";
  }
}

/**
 * Hands the player over if they crossed into another gallery's side of the museum.
 * If that room isn't built yet, the player is held at the line until it is: the
 * corridor beyond the midpoint only exists in the next room's world.
 */
function checkHandover(margin = HANDOVER_MARGIN): void {
  const x = museumFeet().x;
  if (roomOwns(activeIndex, x, margin)) return;
  const next = ROOMS.findIndex((_, i) => i !== activeIndex && roomOwns(i, x, -margin));
  if (next < 0) return;
  if (live.has(next)) {
    switchTo(next);
    return;
  }
  player.undoStep();
  void buildRoom(next);
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
    if (!gameState.isSolved(g.id)) {
      gameState.markSolved(g.id, ex.describe().rules);
      autosave();
    }
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

/** Clicking an in-world control: set its value, or step a cycling control to its next option. */
function pressInteractable(target: Interactable): void {
  if (target.offValue !== undefined && active.exhibit.rule(target.rule).current === target.value) {
    changeRule(target.rule, target.offValue);
    return;
  }
  if (!target.cycle) {
    changeRule(target.rule, target.value);
    return;
  }
  const rule = active.exhibit.rule(target.rule);
  const options = rule.options ?? [];
  const i = options.findIndex((o) => o.value === rule.current);
  changeRule(target.rule, options[(i + 1) % options.length].value);
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

/**
 * Jumps the player to a room (its entrance, or a given spot), building it and its
 * neighbours first. Used by saved progress, the debug panel and the debug API.
 */
async function goToRoom(index: number, at?: { feet: { x: number; y: number; z: number }; yaw: number; pitch: number }): Promise<void> {
  focus = index;
  await ensureAround(index);
  const g = live.get(index)!.gallery;
  const o = OFFSETS[index];
  // `at` is in museum coordinates; the room wants its own.
  switchTo(index, at ? { x: at.feet.x - o.x, y: at.feet.y - o.y, z: at.feet.z } : g.entrance);
  camera.rotation.set(at?.pitch ?? -0.05, at?.yaw ?? g.entranceYaw, 0);
  trimRooms();
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

/** Touch: a tap uses whatever in-world control is under the finger (no crosshair aiming). */
function tapAt(x: number, y: number): void {
  if (mode !== "first-person" || !active.interactables.length) return;
  raycaster.setFromCamera(new THREE.Vector2((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1), camera);
  raycaster.far = 30;
  const hit = raycaster.intersectObjects(active.interactables, false)[0];
  raycaster.far = REACH;
  const target = hit?.object.userData.interact as Interactable | undefined;
  if (!target) return;
  if (hit.distance > TAP_REACH) touch.flash("Walk closer to use it");
  else pressInteractable(target);
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
const CONTROLS = TOUCH
  ? `<b>Left thumb</b>: drag to walk · <b>Right thumb</b>: drag to look ·
      <b>Tap</b> brass buttons and mirrors to use them · <b>Laws</b>: your physics instrument ·
      <b>Reset</b>: start the room again · <b>❚❚</b>: pause`
  : `<b>WASD</b> walk · <b>Mouse</b> look ·
      <b>Click</b> brass buttons to work the exhibits · hold <b>Q</b> for your physics instrument ·
      <b>R</b> reset the room · <b>M</b> mute · <b>Esc</b> pause`;
/** The start card, or once the player has entered, the pause card. */
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];
/** The visitor's ticket: one stamp per gallery, inked once it's solved. */
const FLOOR_NAMES: Record<number, string> = { 1: "Floor 1 · Mechanics", 2: "Floor 2 · Waves and Light", 3: "Floor 3 · Modern Physics" };
/** The visitor's ticket: one stamp per gallery, inked once it's solved, a row per floor. */
function ticketHtml(solved: (id: string) => boolean): string {
  const done = GALLERIES.filter((g) => solved(g.id)).length;
  const floors = [...new Set(GALLERIES.map((g) => g.floor))];
  const rows = floors
    .map((floor) => {
      const stamps = GALLERIES.map((g, i) => ({ g, i }))
        .filter(({ g }) => g.floor === floor)
        .map(({ g, i }) => {
          const name = g.title.replace(/^The /, "").replace(/ Gallery$/, "");
          return `<span class="stamp${solved(g.id) ? " done" : ""}" title="${g.title}"><b>${ROMAN[i]}</b><small>${name}</small></span>`;
        })
        .join("");
      return `<div class="ticket-floor">${FLOOR_NAMES[floor] ?? `Floor ${floor}`}</div><div class="stamps">${stamps}</div>`;
    })
    .join("");
  return `<div class="ticket"><div class="ticket-head">Visitor's ticket · ${done} of ${GALLERIES.length} galleries restored</div>${rows}</div>`;
}

function showOverlay(pausedCard: boolean): void {
  const action = TOUCH ? "Tap" : "Click";
  const saved = savedVisit;
  overlay.innerHTML = pausedCard
    ? `<div class="card"><h1>Paused</h1>${ticketHtml((id) => gameState.isSolved(id))}<p><b>${action}</b> to continue.</p><p class="controls">${CONTROLS}</p></div>`
    : saved
      ? `<div class="card">
        <h1>Welcome back</h1>
        ${ticketHtml((id) => !!saved.solved[id])}
        <p class="visit-buttons"><button type="button" data-visit="continue">Continue your visit</button><button type="button" data-visit="new">Start a new visit</button></p>
        <p class="controls">${CONTROLS}</p>
        ${TOUCH ? `<p class="portrait-hint">Turn your phone sideways for a better view.</p>` : ""}
      </div>`
      : `<div class="card">
        <h1>The Museum of Broken Physics</h1>
        <p>Two floors of galleries whose laws have broken. Put them right, or put them to use.</p>
        <p class="controls"><b>${action}</b> to enter · ${CONTROLS}</p>
        ${TOUCH ? `<p class="portrait-hint">Turn your phone sideways for a better view.</p>` : ""}
      </div>`;
  overlay.classList.remove("hidden");
}
showOverlay(false);

/**
 * Paused by the player (Esc, the ❚❚ button, or leaving the tab): the simulation
 * and sound stop until they click or tap the card. Separate from the debug pause.
 */
let menuPaused = false;
/** Set on resume, so the time spent paused isn't simulated in the next frame. */
let skipFrameTime = false;
let entered = false;

function pauseGame(): void {
  if (AUTOMATION || mode !== "first-person" || !entered || menuPaused) return;
  menuPaused = true;
  keys.clear();
  lowerInstrument();
  touch.setVisible(false);
  sound.suspend();
  showOverlay(true);
}

function resumeGame(): void {
  entered = true;
  menuPaused = false;
  skipFrameTime = true;
  stepper.clear();
  overlay.classList.add("hidden");
  sound.resume();
  if (TOUCH) touch.setVisible(true);
}

overlay.addEventListener("click", (e) => {
  // A returning visitor's card: "Start a new visit" starts over; anywhere else continues.
  chooseVisit((e.target as HTMLElement).closest("[data-visit]")?.getAttribute("data-visit") === "new");
  sound.unlock();
  if (!TOUCH) {
    look.lock(); // resumes on the "lock" event
    return;
  }
  // Touch: no pointer lock; go fullscreen where the browser allows it (not iOS Safari).
  touchEntered = true;
  resumeGame();
  document.documentElement.requestFullscreen?.().catch(() => {});
});
const touch = createTouchControls(renderer.domElement, {
  tap: (x, y) => tapAt(x, y),
  toggleInstrument: () => (instrumentHeld ? lowerInstrument() : raiseInstrument()),
  reset: () => reset(),
  pause: () => pauseGame(),
});
// Audio may only start after a gesture; any key or click will do.
window.addEventListener("pointerdown", () => sound.unlock());
document.body.appendChild(overlay);
if (AUTOMATION) overlay.classList.add("hidden");
look.addEventListener("lock", () => resumeGame());
look.addEventListener("unlock", () => {
  // Esc (or anything else that releases the mouse) pauses the game.
  keys.clear();
  lowerInstrument();
  pauseGame();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

document.addEventListener("mousedown", () => {
  if (instrument.usesVirtualCursor) instrument.click();
  else if (pointerLocked() && hovered && !instrument.isOpen) pressInteractable(hovered);
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

/** Room text is written for mouse and keyboard; on a touchscreen, say it in taps. */
const touchWording = (text: string) =>
  text.replace(/\bClick\b/g, "Tap").replace(/\bclick\b/g, "tap").replace(/\bhold Q\b/g, "tap Laws").replace(/\bHold Q\b/g, "Tap Laws");

/**
 * Laws the player has discovered, and where: a law is learned by putting right a
 * room where it could be changed. The instrument shows what a law should be only
 * once it's known, so it never gives the answer away.
 */
function knownLaws(): Map<string, string> {
  const known = new Map<string, string>();
  for (const room of ROOMS) {
    if (!gameState.isSolved(room.id)) continue;
    for (const law of room.laws) if (!known.has(law)) known.set(law, room.title);
  }
  return known;
}

let lastHud = "";
function renderHud(): void {
  const ex = active.exhibit;
  const changesAllowed = ex.changesLeft > 0 && !ex.isSolved() && !ex.isFailed();
  const pips = "●".repeat(ex.changesLeft) + "○".repeat(ex.changesUsed);
  const hint = mode !== "first-person" ? "" : TOUCH ? "Tap <b>Laws</b> to read the room's laws." : "Hold <b>Q</b> to read the room's laws with your instrument.";
  const restored = GALLERIES.filter((room) => gameState.isSolved(room.id)).length;
  const room = ROOMS[activeIndex];
  const where = room.kind === "gallery" ? `Gallery ${ROMAN[GALLERIES.indexOf(room)]} · ` : "";
  const html = `
    <div class="title">${active.title}</div>
    <div>${active.summary()}${room.kind === "gallery" ? ` · Changes left <span class="pips">${pips}</span>` : ""}</div>
    <div class="status">${TOUCH ? touchWording(active.status(player)) : active.status(player)}</div>
    <div class="keys">${FLOOR_NAMES[room.floor] ?? `Floor ${room.floor}`} · ${where}Galleries restored: ${restored} of ${GALLERIES.length}${hint && room.kind === "gallery" ? ` · ${hint}` : ""}</div>`;
  if (html !== lastHud) hud.innerHTML = lastHud = html;

  // The instrument: pinned open in the window view, raised with Q in first person.
  instrument.update(instrumentModel(ex, active.title, knownLaws()));
  if (mode === "orbit") instrument.open(false, gravityEditable() ? "Arrow keys and Space set gravity too" : "");
  else if (instrumentHeld)
    instrument.open(
      look.isLocked,
      TOUCH ? "Tap Laws again to put it away" : look.isLocked ? "Move the mouse to point · release Q to put away" : "Release Q to put away",
    );
  else instrument.close();
  touch.setInstrumentOpen(instrument.isOpen && mode === "first-person");

  // Touch players tap things directly, so there's no crosshair to aim.
  const showCrosshair = mode === "first-person" && pointerLocked() && !instrument.isOpen && !TOUCH;
  crosshair.classList.toggle("hidden", !showCrosshair);
  crosshair.classList.toggle("active", !!hovered);
  let text = "";
  if (hovered?.cycle) {
    text = ex.isSolved() ? hovered.label.replace(/^Turn/, "") : `Click: ${hovered.label.charAt(0).toLowerCase()}${hovered.label.slice(1)}`;
  } else if (hovered) {
    const rule = ex.rule(hovered.rule);
    const current = rule.current === hovered.value;
    // Controls (the lever) cost nothing, so they work with the budget spent.
    const canChange = rule.control ? !ex.isSolved() && !ex.isFailed() : changesAllowed;
    const action = hovered.rule === "gravity" ? `gravity toward the ${hovered.label.toLowerCase()}` : hovered.label;
    text = current ? (hovered.doneLabel ?? `${hovered.label} (current)`) : canChange ? `Click: ${action}` : hovered.label;
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
    if (!pointerLocked()) showOverlay(entered);
  }
}

/** An orbit pose from any gallery; makes that gallery active (moving the player to it). */
async function setOrbitPose(name: string): Promise<void> {
  const index = ROOMS.findIndex((room) => room.cameras.includes(name));
  if (index < 0) throw new Error(`unknown camera "${name}"`);
  if (index !== activeIndex) await goToRoom(index);
  const pose = active.cameraPoses[name];
  const o = OFFSETS[activeIndex];
  setMode("orbit");
  camera.position.set(pose.position[0] + o.x, pose.position[1] + o.y, pose.position[2]);
  orbit.target.set(pose.target[0] + o.x, pose.target[1] + o.y, pose.target[2]);
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
  windowView: () => void setOrbitPose("window"),
};
gui.add(debug, "paused").name("Pause (P)").onChange((v: boolean) => (paused = v)).listen();
gui.add(debug, "step").name("Step once (.)");
gui.add(debug, "reset").name("Reset room (R)");
gui.add(debug, "firstPerson").name("First person (C)");
gui.add(debug, "windowView").name("View through window (C)");
ROOMS.forEach((room, i) => gui.add({ go: () => void goToRoom(i) }, "go").name(`Go to ${room.title}`));
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
    else void setOrbitPose(Object.keys(active.cameraPoses)[0]);
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
  cameras: [...ROOMS.flatMap((room) => room.cameras), "player"],
  async setCamera(name) {
    if (name === "player") setMode("first-person");
    else await setOrbitPose(name);
  },
  async setPlayer(feet, yaw, pitch = 0) {
    await goToRoom(roomAt(feet.x), { feet: { x: feet.x, y: feet.y ?? 0, z: feet.z }, yaw, pitch });
    setMode("first-person");
  },
  getLoaded: () => [...live.values()].toSorted((a, b) => a.index - b.index).map((room) => room.gallery.id),
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
  screenPosition(value) {
    const button = active.interactables.find((b) => (b.userData.interact as Interactable).value === value);
    if (!button) throw new Error(`no button "${value}" in ${active.id}`);
    const p = button.getWorldPosition(new THREE.Vector3());
    const distance = p.distanceTo(camera.position);
    p.project(camera);
    return { x: ((p.x + 1) / 2) * window.innerWidth, y: ((1 - p.y) / 2) * window.innerHeight, distance };
  },
  getRenderInfo: () => ({ ...renderer.info.render, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
  async setPlayerIn(roomId, feet, yaw, pitch = 0) {
    const index = roomIndex(roomId);
    if (index < 0) throw new Error(`no room "${roomId}"`);
    const o = OFFSETS[index];
    await goToRoom(index, { feet: { x: feet.x + o.x, y: (feet.y ?? 0) + o.y, z: feet.z }, yaw, pitch });
    setMode("first-person");
  },
  getPlayer: () => ({
    feet: museumFeet(),
    yaw: camera.rotation.y,
    pitch: camera.rotation.x,
    hovered: hovered === undefined ? undefined : String(hovered.value),
    gallery: active.id,
  }),
  getGameState: () => gameState.toJSON(),
  isPaused: () => menuPaused,
});

// --- Frame loop ------------------------------------------------------------------
const clock = new THREE.Timer();
const eye = new THREE.Vector3();
renderer.setAnimationLoop((time) => {
  stats.begin();
  clock.update(time);
  const frameDt = skipFrameTime ? 0 : clock.getDelta();
  skipFrameTime = false;
  const frozen = paused || menuPaused;
  // Paused: show the latest step exactly, so "Step once" is visible immediately.
  const alpha = frozen ? 1 : stepper.advance(frameDt);

  if (active.exhibit.isFailed() && !frozen) {
    failedFor += frameDt;
    if (failedFor > AUTO_RESET_SECONDS) reset();
  }

  // Inactive galleries don't step, so draw them exactly at their last step.
  for (const g of liveGalleries()) g.sync.render(g === active ? alpha : 1);
  if (mode === "first-person") {
    // Touch: dragging on the right half turns the view.
    const drag = touch.takeLook();
    if (drag.dx || drag.dy) {
      const k = 0.0055;
      camera.rotation.y -= drag.dx * k;
      camera.rotation.x = Math.max(-1.45, Math.min(1.45, camera.rotation.x - drag.dy * k));
    }
    const p = player.previous;
    const q = player.position;
    const feetOffset = PLAYER.eyeHeight - (PLAYER.halfHeight + PLAYER.radius);
    const o = OFFSETS[activeIndex];
    eye.set(p.x + (q.x - p.x) * alpha + o.x, p.y + (q.y - p.y) * alpha + feetOffset + o.y, p.z + (q.z - p.z) * alpha);
    const shake = frozen ? 0 : active.shake();
    if (shake > 0) eye.add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
    camera.position.copy(eye);
  } else {
    orbit.update();
  }
  updateGalleryLights();
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
