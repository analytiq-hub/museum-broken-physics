// Gallery IX: Young's Double Slit, Floor 2's finale. Sim only: no three.js, no DOM.
//
// A lamp shines through two slits; the light crosses a long glass tank of water and
// falls on a screen as bands of light and dark. A brass light sensor on the screen,
// six bands out from the centre, opens the way on (to the stairs to Floor 3).
//
// Two laws are broken, as in Floor 1's finale:
// - the light's wavelength (its colour): deep red, 770 nm, instead of the lamp's
//   sodium yellow, 589 nm;
// - the tank's refractive index: 0.75 instead of water's 1.33. The player met the
//   refractive index in the Hidden Door, so the instrument already knows that law.
// Bands are spaced λL / (n d). Restoring either law alone leaves a dark band on the
// sensor; both are needed, and the budget is exactly two. (The marks were searched
// so that every other combination stays at most 46% bright: no near misses.)
//
// A free "observer" lamp switches on a detector at the slits. Watching which slit
// the light goes through wipes out the bands: the hint Floor 3 picks up.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import type { Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { fringe, spacing, type Optics } from "./fringes";

export const ROOM: RoomBounds = { xMin: -14.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The optical bench runs west along z = AXIS_Z at the beam's height. */
export const AXIS_Z = -2;
export const BEAM_Y = 1.3;
export const LAMP_X = -1.8;
export const SLITS_X = -4;
export const TANK = { x0: -4.6, x1: -12.4, halfZ: 0.6, y0: 0.6, y1: 2.0 } as const;
export const SCREEN_X = -13.2;
/** The sensor, `SENSOR_BANDS` true bands from the centre of the screen (toward the room). */
export const SENSOR_BANDS = 6;

export const WAVELENGTH_MARKS = [
  { value: 420, label: "Violet (420 nm)" },
  { value: 560, label: "Green (560 nm)" },
  { value: 589, label: "Sodium yellow (589 nm)" },
  { value: 770, label: "Deep red (770 nm)" },
] as const;
export const INDEX_MARKS = [
  { value: 0.75, label: "0.75" },
  { value: 1, label: "Like air (1.0)" },
  { value: 1.33, label: "Water (1.33)" },
] as const;
export const LAW = { wavelength: 589, index: 1.33 } as const;
/** The sensor's offset from the centre of the screen (m): six bands of the true pattern. */
export const SENSOR_Y = SENSOR_BANDS * spacing({ ...LAW, observed: false });

/** The sensor lights when the bands there are at least this bright... */
const LIT = 0.9;
/** ...for this many steps (2 s). */
const LIT_STEPS = 120;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
/** The observer lamp's switch, beside the slits. */
export const OBSERVER = { x: SLITS_X - 0.3, z: AXIS_Z + 1.2 } as const;
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  // The optical bench under the lamp, slits and tank (the player walks around it).
  { name: "bench", kind: "pedestal", center: [(LAMP_X + TANK.x1) / 2, (TANK.y0 - 0.05) / 2, AXIS_Z], half: [(LAMP_X - TANK.x1) / 2 + 0.3, (TANK.y0 - 0.05) / 2, 0.7] },
  { name: "screen", kind: "wall", center: [SCREEN_X, 1.4, AXIS_Z + 0.3], half: [0.05, 1.4, 1.9] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

interface DoubleSlitExtra {
  litSteps: number;
  solved: boolean;
  doorProgress: number;
}

export class DoubleSlitExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: DoubleSlitExtra = { litSteps: 0, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("double-slit", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [wavelengthRule(), indexRule(), observerRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get optics(): Optics {
    return {
      wavelength: this.rule("wavelength").current as number,
      index: this.rule("index").current as number,
      observed: this.rule("observer").current === "on",
    };
  }

  /** How bright the bands are at the sensor, 0..1. */
  get sensorLight(): number {
    return fringe(this.optics, SENSOR_Y);
  }

  get sensorLit(): boolean {
    return this.sensorLight >= LIT;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return false;
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
    if (this.s.solved) return;
    this.s.litSteps = this.sensorLit ? this.s.litSteps + 1 : 0;
    if (this.s.litSteps >= LIT_STEPS) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    this.rule("observer").current = "off";
    this.s.solved = true;
  }

  protected saveExtra(): DoubleSlitExtra {
    return this.s;
  }

  protected loadExtra(extra: DoubleSlitExtra): void {
    this.s = extra;
  }
}

function wavelengthRule(): Rule<number> {
  return {
    id: "wavelength",
    label: "Wavelength of the lamp",
    kind: "range",
    range: { min: 380, max: 800, step: 1 },
    marks: WAVELENGTH_MARKS,
    current: 770,
    nominal: LAW.wavelength,
    editable: true,
    observe: (current) =>
      `Here the lamp's light has a wavelength of ${current} nm. The bands on the screen are spaced in proportion to it.`,
    explain: (current, nominal) =>
      current === nominal
        ? `The lamp burns sodium: its light is ${nominal} nm, as it should be.`
        : `The lamp burns sodium, whose light should be ${nominal} nm (yellow). Here it is ${current} nm.`,
    apply() {},
  };
}

function indexRule(): Rule<number> {
  return {
    id: "index",
    label: "Refractive index of the tank",
    kind: "range",
    range: { min: 0.5, max: 2.5, step: 0.01 },
    marks: INDEX_MARKS,
    current: 0.75,
    nominal: LAW.index,
    editable: true,
    observe: (current) =>
      `Here the tank's refractive index is ${current}. Light's wavelength inside it is its wavelength in air divided by that, so the bands are spaced inversely to it.`,
    explain: (current, nominal) =>
      current === nominal
        ? `The tank holds water, refractive index ${nominal}, as it should.`
        : `The tank holds water, whose refractive index should be ${nominal}. Here it is ${current}.`,
    apply() {},
  };
}

function observerRule(): Rule<string> {
  return {
    id: "observer",
    label: "Observer",
    kind: "choice",
    options: [
      { value: "off", label: "Off" },
      { value: "on", label: "Watching the slits" },
    ],
    current: "off",
    nominal: "off",
    editable: true,
    control: true,
    apply() {},
  };
}
