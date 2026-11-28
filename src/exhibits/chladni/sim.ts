// Gallery VII: the Chladni Plates. Sim only: no three.js, no DOM.
//
// A brass plate on a pedestal, sprinkled with sand, is driven by an oscillator
// with five keys, one note each (free controls, like the organ pipes). The exit
// door's lock is the plate itself: it opens when the sand draws the figure
// engraved on the lock, mode (1, 4).
//
// The broken law is the speed of sound in brass: 2380 m/s instead of 3500. A
// mode's frequency is proportional to it, so every note draws the wrong figure,
// all shifted by the same ratio (0.68). At the broken speed the third key, whose
// note is the lock's figure in true brass, draws mode (3, 4) instead. Restore the
// speed and the third key draws the lock's figure.
//
// Fail: leave the plate ringing at resonance (any figure drawn clearly) for about
// eleven seconds and it cracks. The lock needs three seconds, and a player who
// stops at the first crack is safe.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { K, MODES, modeIndex, modeWeights } from "./plate";

export const ROOM: RoomBounds = { xMin: -10.5, xMax: -0.5, halfZ: 4, height: 4.5 };

export const SPEED_MARKS = [
  { value: 1200, label: "Lead (1200)" },
  { value: 2380, label: "2380 m/s" },
  { value: 3500, label: "Brass (3500)" },
  { value: 5900, label: "Steel (5900)" },
] as const;
export const SPEED_BROKEN = 2380;
export const SPEED_LAW = 3500;

/** The lock's figure: mode (1, 4). */
export const TARGET = modeIndex(1, 4);
/** The oscillator's notes (Hz): in true brass, each lands on a mode; the third on the lock's. */
export const NOTES = [5, 10, 17, 25, 34].map((k) => SPEED_LAW * K * k);

/** The lock opens when its figure answers at least this strongly... */
const LOCK_WEIGHT = 0.8;
/** ...and at least this many times more strongly than any other figure... */
const LOCK_MARGIN = 3;
/** ...for this many steps (3 s). */
const LOCK_STEPS = 180;
/** The plate's strain: dA/dt = −A/τ + k·W, W the strongest mode's response. */
const STRAIN = { k: 0.15, tau: 10 } as const;
export const CRACK_AT = 0.6;
const BREAK_AT = 1;

/** The plate: centre and half-size (m); its top surface is at PLATE.y. */
export const PLATE = { x: -5.5, y: 1.0, z: -1.2, half: 0.7 } as const;
/** The oscillator's console, in front of the plate (the keys are on it). */
export const CONSOLE = { x: PLATE.x, z: PLATE.z + 1.35 } as const;
export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;

export const DOOR = doorBox(ROOM);
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "pedestal", kind: "pedestal", center: [PLATE.x, (PLATE.y - 0.05) / 2, PLATE.z], half: [0.45, (PLATE.y - 0.05) / 2, 0.45] },
  { name: "console", kind: "pedestal", center: [CONSOLE.x, 0.45, CONSOLE.z], half: [0.5, 0.45, 0.25] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

export type NoteChoice = "none" | `${number}`;

interface ChladniExtra {
  lockSteps: number;
  strain: number;
  cracked: boolean;
  broken: boolean;
  solved: boolean;
  doorProgress: number;
}

export class ChladniExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: ChladniExtra = { lockSteps: 0, strain: 0, cracked: false, broken: false, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("chladni", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [speedRule(), gravityRule("down", ["down"], { down: "Floor" }, false), noteRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  /** The key held down (index), or null. */
  get sounding(): number | null {
    const n = this.rule("note").current as NoteChoice;
    return n === "none" ? null : Number(n);
  }

  /** The note driving the plate (Hz), or null. */
  get tone(): number | null {
    const k = this.sounding;
    return k === null ? null : NOTES[k];
  }

  /** How strongly each mode answers right now (the view mixes the sand's figure from these). */
  weights(): number[] {
    if (this.s.broken) return MODES.map(() => 0);
    return modeWeights(this.rule("brass-speed").current as number, this.tone);
  }

  /** 0..1+: the plate's strain; a crack shows at CRACK_AT. */
  get strain(): number {
    return this.s.strain;
  }

  get cracked(): boolean {
    return this.s.cracked;
  }

  get plateBroken(): boolean {
    return this.s.broken;
  }

  /** How long the lock has been satisfied (0..1 of the three seconds it needs). */
  get lockProgress(): number {
    return this.s.solved ? 1 : this.s.lockSteps / LOCK_STEPS;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && this.s.broken;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { door: this.door };
  }

  protected settleBodies(): RAPIER.RigidBody[] {
    return [];
  }

  protected beforeStep(): void {
    if (this.s.solved && this.s.doorProgress < 1) {
      this.s.doorProgress = Math.min(1, this.s.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
      this.door.setNextKinematicTranslation({ x: DOOR.center[0], y: doorY(DOOR, this.s.doorProgress), z: DOOR.center[2] });
    }
  }

  protected afterStep(): void {
    if (this.s.solved || this.s.broken) return;
    const w = this.weights();
    const strongest = Math.max(...w);
    const dt = this.world.timestep;
    const decay = Math.exp(-dt / STRAIN.tau);
    this.s.strain = this.s.strain * decay + STRAIN.k * STRAIN.tau * strongest * (1 - decay);
    if (this.s.strain >= CRACK_AT) this.s.cracked = true;
    if (this.s.strain >= BREAK_AT) {
      this.s.broken = true;
      return;
    }
    const target = w[TARGET];
    const rival = Math.max(...w.filter((_, i) => i !== TARGET));
    this.s.lockSteps = target >= LOCK_WEIGHT && target >= LOCK_MARGIN * rival ? this.s.lockSteps + 1 : 0;
    if (this.s.lockSteps >= LOCK_STEPS) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    this.rule("note").current = "none";
    this.s.solved = true;
  }

  protected saveExtra(): ChladniExtra {
    return this.s;
  }

  protected loadExtra(extra: ChladniExtra): void {
    this.s = extra;
  }
}

function speedRule(): Rule<number> {
  return {
    id: "brass-speed",
    label: "Speed of sound in brass",
    kind: "range",
    range: { min: 1000, max: 6000, step: 10 },
    marks: SPEED_MARKS,
    current: SPEED_BROKEN,
    nominal: SPEED_LAW,
    editable: true,
    observe: (current) =>
      `Here sound travels through the brass at ${current} m/s. Each figure the sand draws is a way the plate can ring, and its pitch is proportional to that speed.`,
    explain: (current, nominal) =>
      current === nominal
        ? `Sound travels through brass at ${nominal} m/s, as it should.`
        : `Sound should travel through brass at ${nominal} m/s. Here it travels at ${current}, so every figure rings at ${(current / nominal).toFixed(2)}× its proper pitch and each note draws the wrong one.`,
    apply() {},
  };
}

function noteRule(): Rule<NoteChoice> {
  return {
    id: "note",
    label: "Oscillator note",
    kind: "choice",
    options: [{ value: "none", label: "Off" }, ...NOTES.map((_, i) => ({ value: `${i}` as NoteChoice, label: `Key ${i + 1}` }))],
    current: "none",
    nominal: "none",
    editable: true,
    control: true,
    apply() {},
  };
}
