// Gallery XI: Stern–Gerlach. Sim only: no three.js, no DOM.
//
// An oven boils off silver atoms; slits narrow them into a beam that passes
// between the poles of a magnet shaped to push each atom up or down by its spin,
// then lands on a glass screen, where the silver builds up as a visible deposit.
// Two brass detectors sit where a quantised beam lands; between them, a fragile
// glass cell.
//
// The broken law is spin's quantisation (../spin.ts): measured along the magnet's
// field, an atom's spin can come out anywhere from fully up to fully down, so each
// atom is pushed by a different amount and the beam smears into a band from top to
// bottom. The
// detectors never fill, and the middle cell, in the smear, slowly overheats and
// cracks (fail). The decoy, three values, adds a spot right on the middle cell,
// which cracks it fast. Put spin right, two values only (up or down), and the
// beam splits into exactly two spots on the detectors: the door opens.
// The oven is a free control: it starts cold.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { spinRule, type Spin } from "../spin";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The beam line runs west along z = AXIS_Z at height BEAM_Y. */
export const AXIS_Z = -1.6;
export const BEAM_Y = 1.45;
export const OVEN_X = -2.2;
export const MAGNET = { x0: -5.0, x1: -8.0 } as const;
export const SCREEN_X = -10.6;
/** The spots' height above and below the beam on the screen (m). */
export const SPLIT = 0.3;
/** Half-height of the detectors at ±SPLIT. */
export const CELL_HALF = 0.07;
/** Half-height of the fragile glass cell in the middle (smaller: the smear only grazes it). */
export const MIDDLE_HALF = 0.04;
/** Height of the bench top: everything on the beam line must clear it. */
export const BENCH_TOP = 0.9;

export { SPIN_MARKS, type Spin } from "../spin";

/** How much of the beam lands on a cell of half-height `half` centred at height y. */
export function beamOnCell(spin: Spin, y: number, half = CELL_HALF): number {
  if (spin === "any") {
    // A smear spread evenly from −SPLIT to +SPLIT (a cell takes its share of the band).
    return Math.abs(y) <= SPLIT ? (2 * half) / (2 * SPLIT) : 0;
  }
  const spots = spin === "two" ? [-SPLIT, SPLIT] : [-SPLIT, 0, SPLIT];
  return spots.some((s) => Math.abs(s - y) < half) ? 1 / spots.length : 0;
}

/** A detector counts as filled when this share of the beam lands on it... */
const FILLED = 0.3;
/** ...and both stay filled, with the middle dark, for this many steps (2 s). */
const LOCK_STEPS = 120;
/** The middle cell heats with the beam on it and cools slowly; it cracks at 1.
 *  A third of the beam (three values) cracks it in ~10 s; the smear's sliver in ~37 s. */
const HEAT = { gain: 0.353, tau: 30 } as const;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
/** The oven's switch: a brass wheel on its side. */
export const OVEN_SWITCH = { x: OVEN_X, z: AXIS_Z + 0.55 } as const;
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "bench", kind: "pedestal", center: [(OVEN_X + SCREEN_X) / 2, BENCH_TOP / 2, AXIS_Z], half: [(OVEN_X - SCREEN_X) / 2 + 0.4, BENCH_TOP / 2, 0.55] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

interface SternGerlachExtra {
  heat: number;
  cracked: boolean;
  lockSteps: number;
  /** Silver deposited on the screen, for the view: seconds of beam per spin setting. */
  exposure: Record<Spin, number>;
  solved: boolean;
  doorProgress: number;
}

export class SternGerlachExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: SternGerlachExtra = { heat: 0, cracked: false, lockSteps: 0, exposure: { any: 0, two: 0, three: 0 }, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("stern-gerlach", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [spinRule(), gravityRule("down", ["down"], { down: "Floor" }, false), ovenRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get spin(): Spin {
    return this.rule("spin").current as Spin;
  }

  get ovenOn(): boolean {
    return this.rule("oven").current === "on";
  }

  /** Share of the beam on the upper detector, the lower one, and the middle cell. */
  cells(): { up: number; down: number; middle: number } {
    if (!this.ovenOn || this.s.cracked) return { up: 0, down: 0, middle: 0 };
    return { up: beamOnCell(this.spin, SPLIT), down: beamOnCell(this.spin, -SPLIT), middle: beamOnCell(this.spin, 0, MIDDLE_HALF) };
  }

  /** 0..1: how hot the middle cell is (it cracks at 1). */
  get heat(): number {
    return this.s.heat;
  }

  get cracked(): boolean {
    return this.s.cracked;
  }

  get exposure(): Readonly<Record<Spin, number>> {
    return this.s.exposure;
  }

  get lockProgress(): number {
    return this.s.solved ? 1 : this.s.lockSteps / LOCK_STEPS;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && this.s.cracked;
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
    if (this.s.solved || this.s.cracked) return;
    const dt = this.world.timestep;
    const c = this.cells();
    if (this.ovenOn) this.s.exposure[this.spin] += dt;
    const decay = Math.exp(-dt / HEAT.tau);
    this.s.heat = this.s.heat * decay + HEAT.gain * HEAT.tau * c.middle * (1 - decay);
    if (this.s.heat >= 1) {
      this.s.cracked = true;
      return;
    }
    const locked = c.up >= FILLED && c.down >= FILLED && c.middle === 0;
    this.s.lockSteps = locked ? this.s.lockSteps + 1 : 0;
    if (this.s.lockSteps >= LOCK_STEPS) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    this.rule("oven").current = "on";
    this.s.exposure = { any: 0, two: 4, three: 0 };
    this.s.solved = true;
  }

  protected saveExtra(): SternGerlachExtra {
    return this.s;
  }

  protected loadExtra(extra: SternGerlachExtra): void {
    this.s = extra;
  }
}

function ovenRule(): Rule<string> {
  return {
    id: "oven",
    label: "Oven",
    kind: "choice",
    options: [
      { value: "off", label: "Cold" },
      { value: "on", label: "Hot" },
    ],
    current: "off",
    nominal: "off",
    editable: true,
    control: true,
    apply() {},
  };
}
