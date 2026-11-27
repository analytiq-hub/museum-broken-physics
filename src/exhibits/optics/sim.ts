// Exhibit 4: the Hidden Door. Optics: the first broken law that isn't
// mechanics. Sim only: no three.js, no DOM.
//
// A lamp casts a beam at table height. It meets mirror A in the far corner,
// passes through a glass prism and on to mirror B, and the walls swallow
// whatever escapes. The broken law is the prism's refractive index: 0.7, so
// light bends the wrong way. Bent wrong, the beam lands on a stretch of the
// west wall and reveals the outline of a hidden door. On the door is a brass
// photocell; light it and the door opens.
//
// Goal: put the index right (glass, 1.5) and turn the mirrors (clicking them
// is free) so the beam reaches the photocell. A search over every index mark
// and every pair of mirror angles found exactly one way: index 1.5 with the
// mirrors at 135° and 120° (tests/exhibits/optics.solver.test.ts).
//
// The beam is traced in the horizontal plane (trace.ts); the physics world
// only holds the room for the player to walk in.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import type { Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, corridor, type Box } from "../layout";
import { mirrorSegment, prism, traceBeam, type BeamResult, type OpticsScene, type Segment, type Vec2 } from "./trace";

/** Interior: x −63..−53, y 0..4.5, z −5..5. Optics coordinates are world (x, z). */
export const ROOM = { xMin: -63, xMax: -53, halfZ: 5, height: 4.5 } as const;
const W = 0.25;
const CX = (ROOM.xMin + ROOM.xMax) / 2;
const HX = (ROOM.xMax - ROOM.xMin) / 2;
/** Height of the beam above the floor. */
export const BEAM_Y = 1.3;

const at = (u: number, z: number): Vec2 => ({ x: CX + u, z });
export const LAMP = { position: at(4.6, -4.2), direction: { x: -1, z: 0 } } as const;
export const MIRRORS = {
  "mirror-a": { position: at(-3.9, -4.2), label: "the corner mirror" },
  "mirror-b": { position: at(-1.86, 2.88), label: "the floor mirror" },
} as const;
export const MIRROR_LENGTH = 0.9;
export const MIRROR_ANGLES = Array.from({ length: 12 }, (_, i) => i * 15);
export const PRISM = { center: at(-3.24, -0.36), side: 1.96, rotation: 49.1 } as const;
/** The hidden door in the west wall, and the photocell on it. */
export const HIDDEN_DOOR = { z0: 1.0, z1: 2.6, height: 2.4 } as const;
export const EYE = { z: 2.14, halfWidth: 0.12 } as const;

export const INDEX_MARKS = [
  { value: 0.7, label: "Backwards (0.7)" },
  { value: 1.0, label: "Air (1.0)" },
  { value: 1.33, label: "Water (1.33)" },
  { value: 1.5, label: "Glass (1.5)" },
  { value: 2.4, label: "Diamond (2.4)" },
] as const;
export const INDEX_BROKEN = 0.7;
export const INDEX_LAW = 1.5;

/** Steps the photocell must stay lit to count. */
const LIT_STEPS = 30;
const DOOR_DROP = 2.5;
const DOOR_OPEN_SECONDS = 1.4;

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;

const dz = (HIDDEN_DOOR.z0 + HIDDEN_DOOR.z1) / 2;
const dh = (HIDDEN_DOOR.z1 - HIDDEN_DOOR.z0) / 2;
export const DOOR: Box = { name: "hidden-door", kind: "wall", center: [ROOM.xMin - W, HIDDEN_DOOR.height / 2, dz], half: [W, HIDDEN_DOOR.height / 2, dh] };

export const STATIC_BOXES: readonly Box[] = [
  { name: "floor", kind: "floor", center: [CX, -W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "ceiling", kind: "ceiling", center: [CX, ROOM.height + W, 0], half: [HX + 0.5, W, ROOM.halfZ + 0.5] },
  { name: "north", kind: "wall", center: [CX, ROOM.height / 2, -ROOM.halfZ - W], half: [HX + 0.5, ROOM.height / 2, W] },
  { name: "south", kind: "wall", center: [CX, ROOM.height / 2, ROOM.halfZ + W], half: [HX + 0.5, ROOM.height / 2, W] },
  // West wall with the hidden door.
  { name: "west-north", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, (-ROOM.halfZ - 0.5 + HIDDEN_DOOR.z0) / 2], half: [W, ROOM.height / 2, (HIDDEN_DOOR.z0 + ROOM.halfZ + 0.5) / 2] },
  { name: "west-south", kind: "wall", center: [ROOM.xMin - W, ROOM.height / 2, (HIDDEN_DOOR.z1 + ROOM.halfZ + 0.5) / 2], half: [W, ROOM.height / 2, (ROOM.halfZ + 0.5 - HIDDEN_DOOR.z1) / 2] },
  { name: "west-lintel", kind: "wall", center: [ROOM.xMin - W, (ROOM.height + HIDDEN_DOOR.height) / 2, dz], half: [W, (ROOM.height - HIDDEN_DOOR.height) / 2, dh] },
  // East wall, with the doorway from the corridor at z 1..3, y 0..3.
  { name: "east-north", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, -2.25], half: [W, ROOM.height / 2, 3.25] },
  { name: "east-south", kind: "wall", center: [ROOM.xMax + W, ROOM.height / 2, 4.25], half: [W, ROOM.height / 2, 1.25] },
  { name: "east-lintel", kind: "wall", center: [ROOM.xMax + W, 3.75, 2], half: [W, 0.75, 1] },
  // Pedestals under the prism and mirrors, and the lamp's stand (the player walks around them).
  { name: "prism-pedestal", kind: "pedestal", center: [PRISM.center.x, (BEAM_Y - 0.35) / 2, PRISM.center.z], half: [0.7, (BEAM_Y - 0.35) / 2, 0.7] },
  ...corridor("east", ROOM.xMax + 2 * W),
  // Beyond the hidden door: the corridor to Gallery V.
  ...corridor("west", ROOM.xMin - 2 * W),
];

/** The optical walls: the room's four walls (the west one split around the door). */
const OPTICAL_WALLS: Segment[] = [
  { id: "north", kind: "wall", a: at(-HX, -ROOM.halfZ), b: at(HX, -ROOM.halfZ) },
  { id: "south", kind: "wall", a: at(-HX, ROOM.halfZ), b: at(HX, ROOM.halfZ) },
  { id: "east", kind: "wall", a: at(HX, -ROOM.halfZ), b: at(HX, ROOM.halfZ) },
  { id: "west", kind: "wall", a: at(-HX, -ROOM.halfZ), b: at(-HX, ROOM.halfZ) },
];
const EYE_SEGMENT: Segment = {
  id: "eye",
  kind: "target",
  a: { x: ROOM.xMin + 0.01, z: EYE.z - EYE.halfWidth },
  b: { x: ROOM.xMin + 0.01, z: EYE.z + EYE.halfWidth },
};

export interface OpticsOptions {
  budget?: number;
}

interface OpticsExtra {
  litSteps: number;
  solved: boolean;
  revealed: boolean;
  doorProgress: number;
}

export class OpticsExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: OpticsExtra = { litSteps: 0, solved: false, revealed: false, doorProgress: 0 };
  private cache: { key: string; beam: BeamResult } | undefined;

  constructor(R: typeof RAPIER, options: OpticsOptions = {}) {
    super("optics", R, options.budget ?? 2);
    const world = this.world;
    const statics = world.createRigidBody(R.RigidBodyDesc.fixed());
    addStaticBoxes(R, world, statics, STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [indexRule(), mirrorRule("mirror-a", 135), mirrorRule("mirror-b", 0)];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  /** The optical scene for the current rules. */
  scene(): OpticsScene {
    return {
      segments: [
        ...OPTICAL_WALLS,
        EYE_SEGMENT,
        ...(Object.entries(MIRRORS) as [keyof typeof MIRRORS, (typeof MIRRORS)[keyof typeof MIRRORS]][]).map(([id, m]) =>
          mirrorSegment(id, m.position, MIRROR_LENGTH, this.rule(id).current as number),
        ),
      ],
      glass: [prism("glass", PRISM.center, PRISM.side, PRISM.rotation, this.rule("index").current as number)],
    };
  }

  /** The beam for the current rules (cached until a rule changes). */
  beam(): BeamResult {
    const key = this.rules.map((r) => String(r.current)).join("|");
    if (this.cache?.key !== key) this.cache = { key, beam: traceBeam(this.scene(), LAMP.position, LAMP.direction) };
    return this.cache.beam;
  }

  /** Is the photocell lit right now? */
  get lit(): boolean {
    return this.beam().end === "target:eye";
  }

  /** Has light ever fallen on the hidden door (revealing its outline)? */
  get revealed(): boolean {
    return this.s.revealed;
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

  protected beforeStep(): void {
    if (!this.s.solved || this.s.doorProgress >= 1) return;
    this.s.doorProgress = Math.min(1, this.s.doorProgress + this.world.timestep / DOOR_OPEN_SECONDS);
    const [x, y, z] = DOOR.center;
    const t = this.s.doorProgress;
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    this.door.setNextKinematicTranslation({ x, y: y - DOOR_DROP * eased, z });
  }

  protected afterStep(): void {
    if (this.s.solved) return;
    const beam = this.beam();
    const end = beam.path.at(-1)!;
    const onDoor = beam.end === "wall:west" && end.z > HIDDEN_DOOR.z0 && end.z < HIDDEN_DOOR.z1;
    if (onDoor || this.lit) this.s.revealed = true;
    this.s.litSteps = this.lit ? this.s.litSteps + 1 : 0;
    if (this.s.litSteps >= LIT_STEPS) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    // The mirrors as the solution leaves them (index 1.5 is set as the law).
    for (const [id, angle] of [["mirror-a", 135], ["mirror-b", 120]] as const) {
      const rule = this.rule(id);
      rule.current = angle;
      rule.apply(this.ctx);
    }
    this.s.solved = true;
    this.s.revealed = true;
  }

  protected saveExtra(): OpticsExtra {
    return this.s;
  }

  protected loadExtra(extra: OpticsExtra): void {
    this.s = extra;
    this.cache = undefined;
  }
}

/** Resetting closes the hidden door: a player in it or beyond is moved back here. */
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 1.8 } as const;

function indexRule(): Rule<number> {
  return {
    id: "index",
    label: "Refractive index",
    kind: "range",
    range: { min: 0.5, max: 2.5, step: 0.01 },
    marks: INDEX_MARKS,
    current: INDEX_BROKEN,
    nominal: INDEX_LAW,
    editable: true,
    observe: (current) =>
      current < 1
        ? `Here the prism's refractive index is ${current}: light travels faster inside the glass than in the air around it.`
        : `Here the prism's refractive index is ${current}: light slows down inside the glass.`,
    explain: (current, nominal) =>
      current < 1
        ? `The prism's refractive index should be ${nominal}, like glass. Here it is ${current}: light speeds up in the glass and bends away from where it should go.`
        : `The prism's refractive index should be ${nominal}, like glass. Here it is ${current}.`,
    apply() {},
  };
}

function mirrorRule(id: keyof typeof MIRRORS, initial: number): Rule<number> {
  return {
    id,
    label: `Mirror (${MIRRORS[id].label})`,
    kind: "choice",
    options: MIRROR_ANGLES.map((value) => ({ value, label: `${value}°` })),
    current: initial,
    nominal: initial,
    editable: true,
    control: true,
    apply() {},
  };
}
