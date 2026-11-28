// Gallery X: Rutherford's Gold Foil, Floor 3's first room. Sim only: no three.js, no DOM.
//
// On a long table, a radium source fires alpha particles west, one every half
// second, at a sheet of gold foil. A phosphor coating on the table shows their
// tracks. The source slides between nine positions across the table (a free
// control). Somewhere in the foil is a gold atom, hidden.
//
// The broken law is where the atom's charge is: spread evenly through it (the
// "plum pudding"), so every particle passes almost straight through and the
// tracks say nothing. Put it right, concentrated in a nucleus, and particles
// passing near the nucleus are flung away from it. Their tracks show which way to
// slide the source. Aimed dead-on, a particle bounces straight back into the
// detector ring around the source's muzzle; three of those open the door.
// A negative nucleus is the decoy: particles curve toward it, and the aimed ones
// are swallowed.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import type { Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { SPEED, stepParticle, type Charge, type Particle } from "./scatter";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The table: the particles fly over it (at its surface height). */
export const TABLE = { x0: -10.8, x1: -2.4, z0: -2.6, z1: 2.6, y: 0.9 } as const;
export const FOIL_X = -7.0;
/** The source's x, and its nine positions across the table. */
export const SOURCE_X = -2.9;
export const SOURCE_SLOTS = Array.from({ length: 9 }, (_, i) => -1.6 + i * 0.4);
/** The hidden atom: in the foil, in line with the source's seventh position. */
export const ATOM_SLOT = 6;
export const ATOM_Z = SOURCE_SLOTS[ATOM_SLOT];
/** A particle counts as bounced back once it returns east of this x. */
const DETECTOR_X = SOURCE_X - 0.5;
const FIRE_STEPS = 30; // one particle every half second
const MAX_PARTICLES = 14;
/** Track points are kept every this many steps. */
const TRACK_EVERY = 3;
const HITS_TO_OPEN = 3;

export const CHARGE_MARKS: { value: Charge; label: string }[] = [
  { value: "spread", label: "Spread through the atom" },
  { value: "nucleus", label: "Concentrated in a nucleus" },
  { value: "negative", label: "A negative nucleus" },
];

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "table", kind: "pedestal", center: [(TABLE.x0 + TABLE.x1) / 2, (TABLE.y - 0.04) / 2, 0], half: [(TABLE.x1 - TABLE.x0) / 2, (TABLE.y - 0.04) / 2, (TABLE.z1 - TABLE.z0) / 2] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

export interface Track {
  points: [number, number][];
  particle: Particle;
}

interface RutherfordExtra {
  tracks: Track[];
  sinceFire: number;
  hits: number;
  solved: boolean;
  doorProgress: number;
}

export class RutherfordExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: RutherfordExtra = { tracks: [], sinceFire: FIRE_STEPS - 1, hits: 0, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("rutherford", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [chargeRule(), sourceRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get charge(): Charge {
    return this.rule("charge").current as Charge;
  }

  /** The source's z (from its slot). */
  get sourceZ(): number {
    return SOURCE_SLOTS[Number(this.rule("source").current)];
  }

  /** Particles in flight and recently finished, with their tracks (for the view). */
  get tracks(): readonly Track[] {
    return this.s.tracks;
  }

  /** Particles that bounced straight back into the detector. */
  get hits(): number {
    return this.s.hits;
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
    const dt = this.world.timestep;
    // The source fires on its own: radium never stops.
    if (++this.s.sinceFire >= FIRE_STEPS) {
      this.s.sinceFire = 0;
      const p: Particle = { x: SOURCE_X, z: this.sourceZ, vx: -SPEED, vz: 0, alive: true, absorbed: false, age: 0 };
      this.s.tracks.push({ points: [[p.x, p.z]], particle: p });
      if (this.s.tracks.length > MAX_PARTICLES) this.s.tracks.shift();
    }
    const bounds = { x0: TABLE.x0, x1: TABLE.x1, z0: TABLE.z0, z1: TABLE.z1 };
    for (const t of this.s.tracks) {
      const p = t.particle;
      if (!p.alive) continue;
      stepParticle(p, this.charge, FOIL_X, ATOM_Z, dt, bounds);
      if (p.age % TRACK_EVERY === 0 || !p.alive) t.points.push([p.x, p.z]);
      // Bounced straight back: into the detector ring around the source.
      if (p.alive && p.vx > 0 && p.x > DETECTOR_X && Math.abs(p.z - this.sourceZ) < 0.35) {
        p.alive = false;
        if (!this.s.solved) this.s.hits++;
      }
    }
    if (!this.s.solved && this.s.hits >= HITS_TO_OPEN) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    this.rule("source").current = String(ATOM_SLOT);
    this.s.hits = HITS_TO_OPEN;
    this.s.solved = true;
  }

  protected saveExtra(): RutherfordExtra {
    return this.s;
  }

  protected loadExtra(extra: RutherfordExtra): void {
    this.s = extra;
  }
}

function chargeRule(): Rule<Charge> {
  return {
    id: "charge",
    label: "The atom's charge",
    kind: "choice",
    options: CHARGE_MARKS,
    current: "spread",
    nominal: "nucleus",
    editable: true,
    observe: () => "How the gold atom's charge is arranged. Alpha particles carry a positive charge: watch how their tracks bend as they pass the foil.",
    explain: (current) =>
      current === "nucleus"
        ? "An atom's positive charge sits in a tiny nucleus, as it should."
        : "An atom's positive charge should sit in a tiny nucleus at its centre. Here it does not.",
    apply() {},
  };
}

function sourceRule(): Rule<string> {
  return {
    id: "source",
    label: "Source position",
    kind: "choice",
    options: SOURCE_SLOTS.map((_, i) => ({ value: String(i), label: `Position ${i + 1}` })),
    current: "0",
    nominal: "0",
    editable: true,
    control: true,
    apply() {},
  };
}
