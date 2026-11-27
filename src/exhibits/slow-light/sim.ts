// Gallery XIII: Slow Light. Sim only: no three.js, no DOM.
//
// A long bench with a flash lamp at its east end. The flash runs west along the
// bench past two photocells: cell A, a metre from the lamp, and cell B, eight
// metres off, behind a clockwork shutter that opens for a moment every few seconds
// (a dial shows when). The door's lock is a coincidence counter: it opens when one
// flash lights both cells at the same instant, as any flash should.
//
// The broken law is the speed of light: here it is 4 m/s, so a flash visibly crawls
// down the bench, lights A, and reaches B two seconds later: never together, and a
// flash that reaches the shutter while it is shut scorches it (twice and it jams:
// fail). The decoy, "slower still", only widens the gap. Put the speed right and a
// flash is everywhere at once: fire it while the shutter is open and the door opens.
// The lamp is a free control; it takes a moment to recharge between flashes.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { FIXED_DT } from "../../engine/physics";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The beam runs west along z = BEAM.z at height BEAM.y: lamp → cell A → shutter and cell B. */
export const BEAM = { z: -2.2, y: 1.2, lamp: -2.4, cellA: -3.4, cellB: -10.4 } as const;
/** Bench height (top surface). */
export const BENCH_Y = 0.95;

export type LightSpeed = "true" | "slow" | "slower";
export const SPEED_MARKS: { value: LightSpeed; label: string }[] = [
  { value: "true", label: "300 000 km/s" },
  { value: "slow", label: "4 m/s" },
  { value: "slower", label: "2 m/s" },
];
export const SPEEDS: Record<LightSpeed, number> = { true: 299_792_458, slow: 4, slower: 2 };

/** The shutter's clockwork, in fixed steps: first opens at 3 s, then every 5 s, for 0.8 s. */
export const SHUTTER = { first: 180, period: 300, open: 48 } as const;
/** The lamp recharges for 1.5 s after each flash. */
export const CHARGE_STEPS = 90;
/** The lock counts the cells as lit together within this many steps (0.1 s). */
const COINCIDENCE_STEPS = 6;
/** Flashes the shutter can take while shut; it jams on the last. */
export const SCORCH_LIMIT = 2;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "bench", kind: "pedestal", center: [(BEAM.lamp + BEAM.cellB) / 2, BENCH_Y / 2, BEAM.z], half: [(BEAM.lamp - BEAM.cellB) / 2 + 0.5, BENCH_Y / 2, 0.45] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

/** Is the shutter open at this step? */
export function shutterOpen(step: number): boolean {
  return step >= SHUTTER.first && (step - SHUTTER.first) % SHUTTER.period < SHUTTER.open;
}

/** A flash in flight: its front's x, and the step it lit cell A (if it has). */
export interface Pulse {
  x: number;
  litA: number | null;
}

/** What the lock last saw, for the view's display and the HUD. */
export type Reading = { kind: "none" } | { kind: "scorched" } | { kind: "apart"; seconds: number } | { kind: "together" };

interface SlowLightExtra {
  steps: number;
  pulses: Pulse[];
  /** The lamp control's value last seen (any change fires the lamp). */
  lampSeen: string;
  /** Steps until the lamp can flash again. */
  charging: number;
  scorches: number;
  reading: Reading;
  /** Steps at which cell A / cell B were last lit (for the view's glow). */
  litA: number;
  litB: number;
  solved: boolean;
  doorProgress: number;
}

export class SlowLightExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: SlowLightExtra = SlowLightExhibit.fresh();

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("slow-light", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [speedRule(), gravityRule("down", ["down"], { down: "Floor" }, false), lampRule()];
    this.finishSetup();
  }

  private static fresh(): SlowLightExtra {
    return { steps: 0, pulses: [], lampSeen: "0", charging: 0, scorches: 0, reading: { kind: "none" }, litA: -1e9, litB: -1e9, solved: false, doorProgress: 0 };
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get speed(): number {
    return SPEEDS[this.rule("light").current as LightSpeed];
  }

  /** Fixed steps since the room was (re)built: the shutter's clock. */
  get clock(): number {
    return this.s.steps;
  }

  get shutterIsOpen(): boolean {
    return shutterOpen(this.s.steps);
  }

  /** 0..1 through the shutter's cycle, 0 at the moment it opens (for the dial). */
  get shutterPhase(): number {
    const t = this.s.steps - SHUTTER.first;
    return (((t % SHUTTER.period) + SHUTTER.period) % SHUTTER.period) / SHUTTER.period;
  }

  get pulses(): readonly Pulse[] {
    return this.s.pulses;
  }

  /** 0..1: how charged the lamp is. */
  get charge(): number {
    return 1 - this.s.charging / CHARGE_STEPS;
  }

  get scorches(): number {
    return this.s.scorches;
  }

  get reading(): Reading {
    return this.s.reading;
  }

  /** Steps since each cell was last lit. */
  sinceLit(): { a: number; b: number } {
    return { a: this.s.steps - this.s.litA, b: this.s.steps - this.s.litB };
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && this.s.scorches >= SCORCH_LIMIT;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { door: this.door };
  }

  protected settleBodies(): RAPIER.RigidBody[] {
    return [];
  }

  protected beforeStep(): void {
    if (this.s.solved && this.s.doorProgress < 1) {
      this.s.doorProgress = Math.min(1, this.s.doorProgress + FIXED_DT / DOOR_OPEN_SECONDS);
      this.door.setNextKinematicTranslation({ x: DOOR.center[0], y: doorY(DOOR, this.s.doorProgress), z: DOOR.center[2] });
    }
  }

  protected afterStep(): void {
    const s = this.s;
    s.steps++;
    if (s.charging > 0) s.charging--;
    // Any click on the lamp fires it, if it has recharged.
    const lamp = this.rule("lamp").current as string;
    if (lamp !== s.lampSeen) {
      s.lampSeen = lamp;
      if (s.charging === 0 && !s.solved && !this.isFailed()) {
        s.pulses.push({ x: BEAM.lamp, litA: null });
        s.charging = CHARGE_STEPS;
      }
    }
    const travel = this.speed * FIXED_DT;
    s.pulses = s.pulses.filter((pulse) => {
      pulse.x -= travel;
      if (pulse.litA === null && pulse.x <= BEAM.cellA) {
        pulse.litA = s.steps;
        s.litA = s.steps;
      }
      if (pulse.x > BEAM.cellB) return true;
      if (s.solved || this.isFailed()) return false;
      if (!shutterOpen(s.steps)) {
        s.scorches++;
        s.reading = { kind: "scorched" };
        return false;
      }
      s.litB = s.steps;
      const apart = s.steps - (pulse.litA ?? s.steps);
      if (apart <= COINCIDENCE_STEPS) {
        s.reading = { kind: "together" };
        s.solved = true;
      } else {
        s.reading = { kind: "apart", seconds: apart * FIXED_DT };
      }
      return false;
    });
  }

  protected arrangeSolved(): void {
    this.s.reading = { kind: "together" };
    this.s.solved = true;
  }

  protected saveExtra(): SlowLightExtra {
    return this.s;
  }

  protected loadExtra(extra: SlowLightExtra): void {
    this.s = extra;
  }
}

function speedRule(): Rule<LightSpeed> {
  return {
    id: "light",
    label: "Speed of light",
    kind: "choice",
    options: SPEED_MARKS,
    current: "slow",
    nominal: "true",
    editable: true,
    observe: () => "How fast light travels here. Watch how long a flash takes to cross the room.",
    explain: (current) =>
      current === "true"
        ? "Light travels at 300 000 km/s, as it should: across this room in a few billionths of a second."
        : "Light should travel at 300 000 km/s. Here it crawls.",
    apply() {},
  };
}

function lampRule(): Rule<string> {
  return {
    id: "lamp",
    label: "Flash lamp",
    kind: "choice",
    options: [
      { value: "0", label: "Ready" },
      { value: "1", label: "Fired" },
    ],
    current: "0",
    nominal: "0",
    editable: true,
    control: true,
    apply() {},
  };
}
