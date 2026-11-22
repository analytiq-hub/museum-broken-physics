import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { FIXED_DT, initPhysics } from "../../src/engine/physics";
import { Player, PLAYER, type PlayerInput } from "../../src/engine/player";
import type { GravityDirection } from "../../src/rules/Rule";
import {
  CONSOLE,
  EXIT_X,
  PLAYER_SPAWN,
  ROOM,
  SidewaysGravityExhibit,
} from "../../src/exhibits/sideways-gravity/sim";

let R: typeof RAPIER;
let ex: SidewaysGravityExhibit;
let player: Player;

beforeAll(async () => {
  R = await initPhysics();
});

afterEach(() => ex?.dispose());

const NORTH = 0;
const WEST = Math.PI / 2;
const EAST = -Math.PI / 2;

function setup(feet: { x: number; y: number; z: number } = PLAYER_SPAWN): void {
  ex = new SidewaysGravityExhibit(R);
  player = new Player(R, feet);
  player.attach(ex.world);
}

/** Steps the player and the room together, as the game loop does. */
function walk(input: Partial<PlayerInput>, seconds: number): void {
  const full: PlayerInput = { forward: 0, right: 0, yaw: NORTH, ...input };
  for (let i = 0; i < Math.round(seconds / FIXED_DT); i++) {
    player.step(full, FIXED_DT);
    ex.step();
  }
}

describe("player", () => {
  it("stands on the floor of the viewing hall", () => {
    setup();
    walk({}, 0.5);
    expect(player.grounded).toBe(true);
    expect(player.feet.y).toBeCloseTo(0, 1);
  });

  it("ignores the room's sideways gravity", () => {
    setup({ x: 0, y: 0, z: 0 }); // inside the gallery, where gravity points east
    walk({}, 2);
    expect(player.position.x).toBeCloseTo(0, 2);
    expect(player.feet.y).toBeCloseTo(0, 1);
  });

  it("walks north through the doorway into the gallery", () => {
    setup();
    walk({ forward: 1 }, 2.5);
    expect(player.position.z).toBeLessThan(4);
    expect(Math.abs(player.position.x)).toBeLessThan(0.5);
  });

  it("is stopped by walls", () => {
    setup({ x: 0, y: 0, z: 0 });
    walk({ forward: 1, yaw: EAST }, 4);
    expect(player.position.x).toBeLessThan(ROOM.halfX - PLAYER.radius + 0.05);
    expect(player.position.x).toBeGreaterThan(ROOM.halfX - PLAYER.radius - 0.2);
  });

  it("can't walk through the console", () => {
    setup({ x: CONSOLE.center[0], y: 0, z: 5 });
    walk({ forward: 1 }, 2.5);
    expect(player.position.z).toBeGreaterThan(CONSOLE.center[2] + CONSOLE.half[2]);
  });

  it("is stopped by the closed door, and walks out once the room is solved", () => {
    setup({ x: -4.5, y: 0, z: 2 });
    walk({ forward: 1, yaw: WEST }, 3);
    expect(player.position.x).toBeGreaterThan(-ROOM.halfX);

    for (const move of ["north", "west", "down"] as GravityDirection[]) {
      ex.setRule("gravity", move);
      while (!ex.isSettled()) walk({}, FIXED_DT);
    }
    walk({}, 2.5); // solve detection and the door sinking
    expect(ex.isSolved()).toBe(true);

    walk({ forward: 1, yaw: WEST }, 3);
    expect(player.position.x).toBeLessThan(EXIT_X);
  });

  it("keeps its position across a room reset", () => {
    setup({ x: 1, y: 0, z: 1 });
    walk({}, 0.5);
    const before = { ...player.position };
    player.detach();
    ex.reset();
    player.attach(ex.world);
    walk({}, 0.5);
    expect(player.position.x).toBeCloseTo(before.x, 2);
    expect(player.position.z).toBeCloseTo(before.z, 2);
    walk({ forward: 1 }, 1);
    expect(player.position.z).toBeLessThan(before.z - 2);
  });
});
