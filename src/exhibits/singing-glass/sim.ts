// Gallery VI: the Singing Glass. Sim only: no three.js, no DOM.
//
// A narrow hall. A small organ with five open pipes stands against the north
// wall. The way on is a tall glass pane in the west doorway. An antique glass
// harmonica sits in a case on the south wall, and two decoy glasses stand on
// shelves; they only ring and wobble.
//
// The broken law is the speed of sound: 229 m/s instead of 343. An open pipe
// sounds at v / 2L, so every pipe plays flat by about a fifth. The glasses'
// own frequencies don't depend on v, so retuning v retunes the organ and
// nothing else. Clicking a pipe sounds it until it's clicked again (a control:
// free). Under the broken law no pipe matches the pane, and the fourth pipe
// sits right on the harmonica: playing every pipe cracks it. In air, exactly
// one pipe matches the pane, which needs about seven seconds of sustained tone.
//
// Goal: shatter the pane. Fail: shatter the harmonica. The resonance maths is
// in resonance.ts; the Rapier world holds only the room and the pane.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, CORRIDOR_5_6, type Box } from "../layout";
import { pipeFrequency, ringGlass, type GlassSpec, type GlassState } from "./resonance";

/** Interior: x −103..−93, y 0..5, z −3.5..3.5. */
export const ROOM = { xMin: -103, xMax: -93, halfZ: 3.5, height: 5 } as const;
const W = 0.25;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const HX = (ROOM.xMax - ROOM.xMin) / 2;

/** Speeds of sound the instrument offers (m/s). */
export const SPEED_MARKS = [
  { value: 229, label: "Too slow (229)" },
  { value: 259, label: "Carbon dioxide (259)" },
  { value: 343, label: "Air (343)" },
  { value: 972, label: "Helium (972)" },
] as const;
export const SPEED_BROKEN = 229;
export const SPEED_LAW = 343;
const SPEED_CO2 = 259;
const SPEED_HELIUM = 972;

/** The organ's five open pipes (m), longest first: C4, E4, A4, C5, F5 in air. */
export const PIPE_LENGTHS = [0.6546, 0.5197, 0.3898, 0.3279, 0.2457] as const;
export const PIPE_NAMES = ["first", "second", "third", "fourth", "fifth"] as const;

/**
 * The glasses. Their frequencies are set by the room's design: the pane is what the
 * third pipe plays in air; the harmonica is what the fourth plays at the broken
 * speed; each decoy is where carbon dioxide or helium puts a pipe.
 */
export const GLASSES: readonly GlassSpec[] = [
  { id: "pane", f0: pipeFrequency(SPEED_LAW, PIPE_LENGTHS[2]), q: 200, k: 0.25, tau: 6 },
  { id: "harmonica", f0: pipeFrequency(SPEED_BROKEN, PIPE_LENGTHS[3]), q: 60, k: 0.6, tau: 3 },
  { id: "decoy-goblet", f0: pipeFrequency(SPEED_CO2, PIPE_LENGTHS[2]), q: 80, k: 0.5, tau: 2, decoy: true },
  { id: "decoy-flute", f0: pipeFrequency(SPEED_HELIUM, PIPE_LENGTHS[1]), q: 80, k: 0.5, tau: 2, decoy: true },
];

/** The organ against the north wall: pipe i stands at x = ORGAN.x0 + i · ORGAN.spacing. */
export const ORGAN = { x0: -97.4, spacing: 0.32, z: -ROOM.halfZ + 0.45, baseY: 0.9 } as const;
/** The harmonica's case on the south wall. */
export const HARMONICA = { x: -97.5, y: 1.1, z: ROOM.halfZ - 0.35 } as const;
/** Decoy glasses on shelves. */
export const DECOYS = {
  "decoy-goblet": { x: -100.6, y: 1.35, z: ROOM.halfZ - 0.25 },
  "decoy-flute": { x: -95.2, y: 1.35, z: -ROOM.halfZ + 0.25 },
} as const;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;

/** End walls either side of a doorway at z 1..3 (walls run 0.5 past the room's sides). */
const NORTH_PIECE = { center: (-ROOM.halfZ - 0.5 + 1) / 2, half: (1 + ROOM.halfZ + 0.5) / 2 };
const SOUTH_PIECE = { center: (3 + ROOM.halfZ + 0.5) / 2, half: (ROOM.halfZ + 0.5 - 3) / 2 };

export const STATIC_BOXES: readonly Box[] = [
  { name: "floor", kind: "floor", center: [CX, -W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "ceiling", kind: "ceiling", center: [CX, ROOM.height + W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "north", kind: "wall", center: [CX, ROOM.height / 2, -ROOM.halfZ - W], half: [HX + 0.5, ROOM.height / 2, W] },
  { name: "south", kind: "wall", center: [CX, ROOM.height / 2, ROOM.halfZ + W], half: [HX + 0.5, ROOM.height / 2, W] },
  // East wall, with the doorway from the corridor at z 1..3, y 0..3.
  { name: "east-north", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, NORTH_PIECE.center], half: [W, ROOM.height / 2, NORTH_PIECE.half] },
  { name: "east-south", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, SOUTH_PIECE.center], half: [W, ROOM.height / 2, SOUTH_PIECE.half] },
  { name: "east-lintel", kind: "wall", center: [ROOM.xMax + W, (3 + ROOM.height) / 2, 2], half: [W, (ROOM.height - 3) / 2, 1] },
  // West wall, with the glass pane in the doorway (z 1..3, y 0..3).
  { name: "west-north", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, NORTH_PIECE.center], half: [W, ROOM.height / 2, NORTH_PIECE.half] },
  { name: "west-south", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, SOUTH_PIECE.center], half: [W, ROOM.height / 2, SOUTH_PIECE.half] },
  { name: "west-lintel", kind: "wall", center: [ROOM.xMin - W, (3 + ROOM.height) / 2, 2], half: [W, (ROOM.height - 3) / 2, 1] },
  // The organ's case (the player walks around it).
  { name: "organ", kind: "pedestal", center: [ORGAN.x0 + 2 * ORGAN.spacing, ORGAN.baseY / 2, ORGAN.z], half: [0.95, ORGAN.baseY / 2, 0.35] },
  // The closing alcove behind the pane.
  { name: "alcove-floor", kind: "floor", center: [ROOM.xMin - 1.75, -W, 2], half: [1.25, W, 1.5] },
  { name: "alcove-ceiling", kind: "ceiling", center: [ROOM.xMin - 1.75, 3 + W, 2], half: [1.25, W, 1.5] },
  { name: "alcove-north", kind: "wall", center: [ROOM.xMin - 1.75, 1.5, 1 - W], half: [1.25, 1.5, W] },
  { name: "alcove-south", kind: "wall", center: [ROOM.xMin - 1.75, 1.5, 3 + W], half: [1.25, 1.5, W] },
  { name: "alcove-end", kind: "wall", center: [ROOM.xMin - 3 - W, 1.5, 2], half: [W, 1.5, 1.5] },
  ...CORRIDOR_5_6,
];

/** The glass pane filling the west doorway: it blocks the way until it shatters. */
export const PANE: Box = { name: "pane", kind: "glass", center: [ROOM.xMin - W, 1.5, 2], half: [0.03, 1.5, 1] };
/** The alcove at the end of the museum, behind the pane. */
export const ALCOVE = { xMin: ROOM.xMin - 3, xMax: ROOM.xMin - 0.5 } as const;
/** No door closes on reset here, but the pane comes back: a player beyond it is brought inside. */
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

/** "none" or the pipe's index ("0".."4"). */
export type PipeChoice = "none" | `${number}`;

interface SingingExtra {
  glasses: GlassState[];
}

export class SingingGlassExhibit extends ExhibitBase {
  private readonly paneHandle: number;
  private s: SingingExtra = { glasses: GLASSES.map(() => ({ amplitude: 0, cracked: false, broken: false })) };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("singing-glass", R, options.budget ?? 2);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);
    const pane = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...PANE.center));
    world.createCollider(R.ColliderDesc.cuboid(...PANE.half).setCollisionGroups(ROOM_GROUPS), pane);
    this.paneHandle = pane.handle;

    this.rules = [speedRule(), gravityRule("down", ["down"], { down: "Floor" }, false), pipeRule()];
    this.finishSetup();
  }

  get pane(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.paneHandle);
  }

  /** The pane as a door, for the shared door tests: it "opens" by shattering. */
  get door(): RAPIER.RigidBody {
    return this.pane;
  }

  /** The pipe sounding now (index), or null. */
  get sounding(): number | null {
    const p = this.rule("pipe").current as PipeChoice;
    return p === "none" ? null : Number(p);
  }

  /** The tone filling the room (Hz), or null. */
  get tone(): number | null {
    const p = this.sounding;
    return p === null ? null : pipeFrequency(this.rule("speed").current as number, PIPE_LENGTHS[p]);
  }

  glass(id: string): GlassState {
    return this.s.glasses[GLASSES.findIndex((g) => g.id === id)];
  }

  isSolved(): boolean {
    return this.glass("pane").broken;
  }

  isFailed(): boolean {
    return !this.isSolved() && this.glass("harmonica").broken;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return { pane: this.pane };
  }

  /** Nothing moves here; "settled" means no glass is ringing. */
  protected settleBodies(): RAPIER.RigidBody[] {
    return [];
  }

  protected afterStep(): void {
    // Once a glass has broken, the room's outcome is decided; the rest fall quiet.
    const decided = this.isSolved() || this.isFailed();
    const tone = decided ? null : this.tone;
    this.s.glasses = this.s.glasses.map((state, i) => ringGlass(state, GLASSES[i], tone, this.world.timestep));
    // The shattered pane no longer blocks the doorway.
    if (this.glass("pane").broken && this.pane.translation().y > -5) {
      this.pane.setNextKinematicTranslation({ x: PANE.center[0], y: -10, z: PANE.center[2] });
    }
  }

  protected arrangeSolved(): void {
    this.s.glasses = this.s.glasses.map((state, i) => (GLASSES[i].id === "pane" ? { amplitude: 1, cracked: true, broken: true } : state));
  }

  protected saveExtra(): SingingExtra {
    return this.s;
  }

  protected loadExtra(extra: SingingExtra): void {
    this.s = extra;
  }
}

function speedRule(): Rule<number> {
  return {
    id: "speed",
    label: "Speed of sound",
    kind: "range",
    range: { min: 200, max: 1000, step: 1 },
    marks: SPEED_MARKS,
    current: SPEED_BROKEN,
    nominal: SPEED_LAW,
    editable: true,
    observe: (current) =>
      `Here sound travels at ${current} m/s. An open pipe sounds at v / 2L (v, the speed of sound; L, its length), so every pipe's note follows it.`,
    explain: (current, nominal) =>
      current === nominal
        ? `Sound travels at ${nominal} m/s in air, as it should.`
        : `In air, sound should travel at ${nominal} m/s. Here it travels at ${current}, so every pipe plays ${current < nominal ? "flat" : "sharp"}: an open pipe sounds at v / 2L.`,
    // The tone is computed from it each step (resonance.ts); nothing to push into the world.
    apply() {},
  };
}

function pipeRule(): Rule<PipeChoice> {
  return {
    id: "pipe",
    label: "Sounding pipe",
    kind: "choice",
    options: [{ value: "none", label: "None" }, ...PIPE_LENGTHS.map((_, i) => ({ value: `${i}` as PipeChoice, label: `Pipe ${i + 1}` }))],
    current: "none",
    nominal: "none",
    editable: true,
    control: true,
    apply() {},
  };
}
