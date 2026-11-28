// Gallery XII: the Quantum Tunnel. Sim only: no three.js, no DOM.
//
// A long glass case on a bench, in three compartments: a well where a brass claw
// holds a marble, a cup beyond a thin glass wall, and a drain beyond the cup. The
// exit door opens when the marble rests in the cup, which no marble can reach by
// rolling: the walls are glass.
//
// The broken law is Planck's constant: here it is enormous, so once the lever drops
// the marble into the well, the marble is a spread-out wave, and its probability
// leaks through the glass, into the cup and on into the drain (leak.ts). Putting the
// constant right measures the marble: it collapses into whichever compartment holds
// the most probability. Too soon and it is still in the well (and now classical, so
// it stays there); too late and it is lost down the drain (fail). In between, it
// lands in the cup. A decoy, "larger still", leaks faster: a shorter window.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import type { Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { collapse, leak, type Compartment, type Probabilities } from "./leak";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The case runs along z = CASE.z at bench height; compartments well → cup → drain going west. */
export const CASE = { z: -2.2, y: 0.95, height: 0.55, halfZ: 0.35, well: [-3.8, -5.8], cup: [-6.0, -8.0], drain: [-8.2, -10.2] } as const;
/** The lever beside the well (a control: free). */
export const LEVER = { x: -4.4, z: CASE.z + 0.9 } as const;

export const PLANCK_MARKS = [
  { value: 0, label: "6.6 × 10⁻³⁴ J·s" },
  { value: 1, label: "0.66 J·s" },
  { value: 2.5, label: "6.6 J·s" },
] as const;
export const PLANCK_BROKEN = 1;
export const PLANCK_LAW = 0;
/** Lost: this much of the marble has drained away. */
const LOST = 0.9;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "bench", kind: "pedestal", center: [(CASE.well[0] + CASE.drain[1]) / 2, (CASE.y - 0.05) / 2, CASE.z], half: [(CASE.well[0] - CASE.drain[1]) / 2 + 0.3, (CASE.y - 0.05) / 2, 0.5] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

interface TunnelExtra {
  released: boolean;
  p: Probabilities;
  /** Where the last measurement found the marble (null while it is a wave). */
  found: Compartment | null;
  solved: boolean;
  doorProgress: number;
}

const START: Probabilities = { well: 1, cup: 0, drain: 0 };

export class TunnelExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: TunnelExtra = { released: false, p: { ...START }, found: null, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("tunnel", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [planckRule(), leverRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get released(): boolean {
    return this.s.released;
  }

  /** Where the marble's probability is (all in the well until the lever drops it). */
  get probabilities(): Probabilities {
    return this.s.p;
  }

  /** Where it was found when last measured, or null while it is spread out. */
  get found(): Compartment | null {
    return this.s.found;
  }

  get lost(): boolean {
    return this.s.found === "drain" || this.s.p.drain >= LOST;
  }

  private get scale(): number {
    return this.rule("planck").current as number;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && this.lost;
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
    if (!this.s.released && this.rule("lever").current === "pulled") this.s.released = true;
  }

  protected afterStep(): void {
    if (!this.s.released || this.s.solved || this.isFailed()) return;
    const scale = this.scale;
    if (scale === 0) {
      // Classical again: a measurement. The marble is wherever its probability mostly was.
      if (this.s.found === null) {
        this.s.found = collapse(this.s.p);
        this.s.p = { well: 0, cup: 0, drain: 0, [this.s.found]: 1 } as Probabilities;
        if (this.s.found === "cup") this.s.solved = true;
      }
      return;
    }
    // Quantum: the marble spreads out again from wherever it was found.
    this.s.found = null;
    this.s.p = leak(this.s.p, scale, this.world.timestep);
  }

  protected arrangeSolved(): void {
    this.rule("lever").current = "pulled";
    this.s.released = true;
    this.s.p = { well: 0, cup: 1, drain: 0 };
    this.s.found = "cup";
    this.s.solved = true;
  }

  protected saveExtra(): TunnelExtra {
    return this.s;
  }

  protected loadExtra(extra: TunnelExtra): void {
    this.s = extra;
  }
}

function planckRule(): Rule<number> {
  return {
    id: "planck",
    label: "Planck's constant",
    kind: "range",
    range: { min: 0, max: 2.5, step: 0.5 },
    marks: PLANCK_MARKS,
    current: PLANCK_BROKEN,
    nominal: PLANCK_LAW,
    editable: true,
    observe: () => "Planck's constant sets how wave-like things are: the larger it is, the more a body spreads out like a wave instead of sitting in one place.",
    explain: (current) =>
      current === 0
        ? "Planck's constant is tiny, 6.6 × 10⁻³⁴ J·s, as it should be."
        : "Planck's constant should be tiny, 6.6 × 10⁻³⁴ J·s, so marbles never tunnel. Here it is enormous.",
    apply() {},
  };
}

function leverRule(): Rule<string> {
  return {
    id: "lever",
    label: "Lever",
    kind: "choice",
    options: [
      { value: "held", label: "Held" },
      { value: "pulled", label: "Pulled" },
    ],
    current: "held",
    nominal: "held",
    editable: true,
    control: true,
    apply() {},
  };
}
