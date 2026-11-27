// Gallery XV: the Silver Vault, Floor 3's finale. Sim only: no three.js, no DOM.
//
// Two of the floor's laws, broken at once. An oven burns one measured pellet of
// silver (a two-second puff of atoms); slits make a beam that passes a magnet and,
// if spin is right, splits cleanly in two. The upper half lands on a glass wall,
// and behind the glass is the vault. The lower half lands on a brass dump plate.
// The door opens when the vault is found holding enough silver.
//
// Spin is broken (any value along the field, ../spin.ts): the beam smears, and little of it reaches the
// glass. Planck's constant is broken (enormous): silver on the glass tunnels
// through it into the vault, and on out through the vault's back grate. Putting
// Planck's constant right measures the silver: it stays where it is found. So:
// restore spin before lighting the oven, let the silver tunnel in, then restore
// Planck's constant while the vault holds the most. Too soon and it is still on
// the glass; too late and it has leaked out the back. Either way the vault falls
// short (fail). The decoys (spin with three values, Planck's constant larger still)
// waste silver or shorten the window.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { FIXED_DT } from "../../engine/physics";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { spinRule, type Spin } from "../spin";
import { leak } from "../tunnel/leak";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The beam runs west along z = AXIS_Z at height BEAM_Y; the halves split by ±SPLIT at the glass. */
export const AXIS_Z = -1.6;
export const BEAM_Y = 1.3;
export const SPLIT = 0.45;
export const OVEN_X = -2.2;
export const MAGNET = { x0: -4.2, x1: -6.6 } as const;
/** The glass wall the upper half lands on; the vault behind it; the back grate. */
export const VAULT = { glass: -9.0, back: -10.2, halfZ: 0.35, halfY: 0.3 } as const;
export const LEVER = { x: -3.0, z: AXIS_Z + 0.9 } as const;

export { SPIN_MARKS, type Spin } from "../spin";
export const PLANCK_MARKS = [
  { value: 0, label: "True (6.6 × 10⁻³⁴ J·s)" },
  { value: 1, label: "Huge (0.66 J·s)" },
  { value: 2.5, label: "Larger still (6.6 J·s)" },
] as const;

/** Share of the beam that lands on the glass, per spin setting (cell ±0.07 m around +SPLIT). */
export const TO_GLASS: Record<Spin, number> = { any: 0.07 / SPLIT, two: 0.5, three: 1 / 3 };
/** The pellet: a total of 1 (all the silver), burnt over this many steps (2 s). */
export const BURN_STEPS = 120;
/** The vault must hold this much silver when measured. */
export const NEED = 0.23;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "bench", kind: "pedestal", center: [(OVEN_X + VAULT.back) / 2, 0.45, AXIS_Z], half: [(OVEN_X - VAULT.back) / 2 + 0.4, 0.45, 0.55] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

export interface Silver {
  /** On the glass wall. */
  glass: number;
  /** In the vault. */
  vault: number;
  /** Leaked out through the back grate. */
  out: number;
}

interface VaultExtra {
  /** Steps of the pellet burnt so far (0 until the oven is lit). */
  burnt: number;
  silver: Silver;
  solved: boolean;
  failed: boolean;
  doorProgress: number;
}

export class VaultExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: VaultExtra = { burnt: 0, silver: { glass: 0, vault: 0, out: 0 }, solved: false, failed: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("vault", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [spinRule(), planckRule(), gravityRule("down", ["down"], { down: "Floor" }, false), ovenRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get spin(): Spin {
    return this.rule("spin").current as Spin;
  }

  private get scale(): number {
    return this.rule("planck").current as number;
  }

  get lit(): boolean {
    return this.rule("oven").current === "lit";
  }

  /** Is the oven burning right now? */
  get burning(): boolean {
    return this.lit && this.s.burnt < BURN_STEPS && !this.s.solved && !this.s.failed;
  }

  /** Has the whole pellet burnt? */
  get spent(): boolean {
    return this.s.burnt >= BURN_STEPS;
  }

  /** Silver is a spread-out wave (Planck's constant enormous), not yet measured. */
  get wave(): boolean {
    return this.scale !== 0 && !this.s.solved && !this.s.failed;
  }

  get silver(): Readonly<Silver> {
    return this.s.silver;
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return this.s.failed;
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
    if (s.solved || s.failed) return;
    if (this.burning) {
      s.burnt++;
      s.silver.glass += TO_GLASS[this.spin] / BURN_STEPS;
    }
    const scale = this.scale;
    if (scale !== 0) {
      const p = leak({ well: s.silver.glass, cup: s.silver.vault, drain: s.silver.out }, scale, FIXED_DT);
      s.silver = { glass: p.well, vault: p.cup, out: p.drain };
      // Too much has leaked through for the vault ever to hold enough.
      if (this.spent && s.silver.glass + s.silver.vault < NEED) s.failed = true;
      return;
    }
    // Planck's constant is right: once the pellet is spent, the silver is measured where it is.
    if (!this.spent) return;
    if (s.silver.vault >= NEED) s.solved = true;
    else s.failed = true;
  }

  protected arrangeSolved(): void {
    this.rule("oven").current = "lit";
    this.s.burnt = BURN_STEPS;
    this.s.silver = { glass: 0.15, vault: 0.25, out: 0.1 };
    this.s.solved = true;
  }

  protected saveExtra(): VaultExtra {
    return this.s;
  }

  protected loadExtra(extra: VaultExtra): void {
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
    current: 1,
    nominal: 0,
    editable: true,
    observe: (current) =>
      current === 0
        ? "Here Planck's constant is far too small to notice: silver stays where it lands."
        : "Here Planck's constant is enormous: silver is a spread-out wave, and leaks through glass it could never pass.",
    explain: (current) =>
      current === 0
        ? "Planck's constant is tiny, 6.6 × 10⁻³⁴ J·s, as it should be."
        : "Planck's constant should be tiny, 6.6 × 10⁻³⁴ J·s, so nothing tunnels through glass. Here it is enormous.",
    apply() {},
  };
}

function ovenRule(): Rule<string> {
  return {
    id: "oven",
    label: "Oven",
    kind: "choice",
    options: [
      { value: "cold", label: "Cold" },
      { value: "lit", label: "Lit" },
    ],
    current: "cold",
    nominal: "cold",
    editable: true,
    control: true,
    apply() {},
  };
}
