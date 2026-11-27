// Gallery VIII: the Backwards Furnace. Sim only: no three.js, no DOM.
//
// A freezing boiler room. The exit door is latched by a plug of ice in a brass
// frame. A lamp shines on a mirror that the player turns (a free control) to aim
// the beam at the ice, at a cold iron stove, at a wax-sealed display case, or at
// the bare wall.
//
// The broken law is the direction of heat flow: here heat flows from cold to hot.
// The tell-tales: the unlit stove, a little warmer than the room, slowly runs away
// to a red glow, and frost creeps over the walls as the air is drained.
//
// - Under the law, the beam only warms the ice to about −3 °C (the cold room
//   drains it): it never melts, so "just restore the law" fails.
// - Under the broken law, the beam-warmed ice pulls heat in from the room and
//   runs away: it melts, and the latch drops with a hiss.
// - Left broken, the meltwater keeps heating and boils: the steam bursts the frame
//   and jams the door (fail). Melting the wax seal is a second way to fail.
// Solution: aim at the ice, wait for the melt, restore the law before it boils.
// The heat maths is in heat.ts.
import type RAPIER from "@dimforge/rapier3d-compat";
import { ROOM_GROUPS } from "../../engine/groups";
import { gravityRule, type Rule } from "../../rules/Rule";
import { ExhibitBase } from "../Exhibit";
import { addStaticBoxes, doorBox, doorY, roomShell, type Box, type RoomBounds } from "../layout";
import { BOILING, WAX_MELTS, initialHeat, stepHeat, type HeatNode, type HeatState } from "./heat";

export const ROOM: RoomBounds = { xMin: -12.5, xMax: -0.5, halfZ: 4, height: 4.5 };
/** The beam's height. */
export const BEAM_Y = 1.3;
export const LAMP = { x: -1.4, z: -3.2 } as const;
export const MIRROR = { x: -6.5, z: -0.6 } as const;
/** Where the beam lands for each aim. */
export const AIMS = {
  wall: { x: -2.6, z: ROOM.halfZ - 0.05, label: "the wall" },
  ice: { x: ROOM.xMin + 0.12, z: -0.2, label: "the ice plug" },
  stove: { x: -9.5, z: -ROOM.halfZ + 0.75, label: "the stove" },
  wax: { x: -6.0, z: ROOM.halfZ - 0.6, label: "the wax seal" },
} as const;
export type Aim = keyof typeof AIMS;
const AIM_ORDER: Aim[] = ["wall", "ice", "stove", "wax"];

export const ENTRANCE = { x: ROOM.xMax - 0.6, y: 0, z: 2 } as const;
export const DOOR = doorBox(ROOM);
export const STATIC_BOXES: readonly Box[] = [
  ...roomShell(ROOM),
  { name: "stove", kind: "pedestal", center: [AIMS.stove.x, 0.55, -ROOM.halfZ + 0.55], half: [0.55, 0.55, 0.55] },
  { name: "wax-case", kind: "pedestal", center: [AIMS.wax.x, 0.45, ROOM.halfZ - 0.45], half: [0.45, 0.45, 0.45] },
  { name: "lamp-stand", kind: "pedestal", center: [LAMP.x, (BEAM_Y - 0.2) / 2, LAMP.z], half: [0.2, (BEAM_Y - 0.2) / 2, 0.2] },
  { name: "mirror-stand", kind: "pedestal", center: [MIRROR.x, 0.4, MIRROR.z], half: [0.2, 0.4, 0.2] },
];
const DOOR_OPEN_SECONDS = 1.2;
export const DOORWAY_X = ROOM.xMin + 0.4;
export const RESET_SPOT = { x: ROOM.xMin + 1.4, y: 0, z: 2 } as const;

export type HeatLaw = "hot-to-cold" | "cold-to-hot";

interface FurnaceExtra {
  heat: HeatState;
  boiled: boolean;
  waxMelted: boolean;
  solved: boolean;
  doorProgress: number;
}

export class FurnaceExhibit extends ExhibitBase {
  private readonly doorHandle: number;
  private s: FurnaceExtra = { heat: initialHeat(), boiled: false, waxMelted: false, solved: false, doorProgress: 0 };

  constructor(R: typeof RAPIER, options: { budget?: number } = {}) {
    super("furnace", R, options.budget ?? 2);
    const world = this.world;
    addStaticBoxes(R, world, world.createRigidBody(R.RigidBodyDesc.fixed()), STATIC_BOXES);
    const door = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(...DOOR.center));
    world.createCollider(R.ColliderDesc.cuboid(...DOOR.half).setCollisionGroups(ROOM_GROUPS), door);
    this.doorHandle = door.handle;
    this.rules = [heatRule(), gravityRule("down", ["down"], { down: "Floor" }, false), mirrorRule()];
    this.finishSetup();
  }

  get door(): RAPIER.RigidBody {
    return this.world.getRigidBody(this.doorHandle);
  }

  get temperatures(): Record<HeatNode, number> {
    return this.s.heat.T;
  }

  /** How much of the ice plug has melted, 0..1. */
  get melted(): number {
    return this.s.heat.melted;
  }

  /** Has the ice let go of the latch? */
  get unlatched(): boolean {
    return this.s.heat.melted >= 1;
  }

  get boiled(): boolean {
    return this.s.boiled;
  }

  get waxMelted(): boolean {
    return this.s.waxMelted;
  }

  get aim(): Aim {
    return this.rule("mirror").current as Aim;
  }

  /** 0..1: how far the frost has crept (it follows the room being drained by the runaway stove). */
  get frost(): number {
    return this.lawBroken ? Math.min(1, Math.max(0, (this.s.heat.T.stove - 20) / 300)) : 0;
  }

  get lawBroken(): boolean {
    return this.rule("heat").current === "cold-to-hot";
  }

  isSolved(): boolean {
    return this.s.solved;
  }

  isFailed(): boolean {
    return !this.s.solved && (this.s.boiled || this.s.waxMelted);
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
    const aim = this.aim;
    const beam: HeatNode | null = aim === "wall" ? null : aim;
    this.s.heat = stepHeat(this.s.heat, this.lawBroken ? -1 : 1, beam, this.world.timestep);
    if (this.s.solved || this.isFailed()) return;
    const T = this.s.heat.T;
    if (this.s.heat.melted >= 1 && T.ice >= BOILING) this.s.boiled = true;
    if (T.wax >= WAX_MELTS) this.s.waxMelted = true;
    // The latch is free and heat flows the right way again: the meltwater calms, the door opens.
    if (this.unlatched && !this.lawBroken && !this.isFailed()) this.s.solved = true;
  }

  protected arrangeSolved(): void {
    this.s.heat = { T: { ice: 2, stove: -8, wax: -8 }, melted: 1 };
    this.s.solved = true;
  }

  protected saveExtra(): FurnaceExtra {
    return this.s;
  }

  protected loadExtra(extra: FurnaceExtra): void {
    this.s = extra;
  }
}

function heatRule(): Rule<HeatLaw> {
  return {
    id: "heat",
    label: "Heat flow",
    kind: "choice",
    options: [
      { value: "hot-to-cold", label: "Hot → cold" },
      { value: "cold-to-hot", label: "Cold → hot" },
    ],
    current: "cold-to-hot",
    nominal: "hot-to-cold",
    editable: true,
    observe: (current) =>
      current === "cold-to-hot"
        ? "Here heat flows from cold things into warmer ones: whatever is warmest keeps getting warmer, and the cold gets colder."
        : "Here heat flows from warm things into colder ones: everything drifts toward the temperature of the room.",
    explain: (current) =>
      current === "cold-to-hot"
        ? "Heat should flow from hot to cold, evening things out. Here it flows from cold to hot: a warm spot runs away, hotter and hotter."
        : "Heat flows from hot to cold, as it should.",
    apply() {},
  };
}

function mirrorRule(): Rule<Aim> {
  return {
    id: "mirror",
    label: "Mirror",
    kind: "choice",
    options: AIM_ORDER.map((value) => ({ value, label: AIMS[value].label })),
    current: "wall",
    nominal: "wall",
    editable: true,
    control: true,
    apply() {},
  };
}
