// The room list (src/galleries/rooms.ts) describes galleries without building them,
// so it must stay in step with the real thing: laws, cameras, and who owns which floor.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import type { ExhibitBase } from "../../src/exhibits/Exhibit";
import { SidewaysGravityExhibit, PLAYER_SPAWN, STATIC_BOXES as SIDEWAYS_BOXES } from "../../src/exhibits/sideways-gravity/sim";
import { PendulumExhibit, ENTRANCE as PENDULUM_ENTRANCE, STATIC_BOXES as PENDULUM_BOXES } from "../../src/exhibits/pendulum/sim";
import { LeaningPendulumExhibit, ENTRANCE as LEANING_ENTRANCE, STATIC_BOXES as LEANING_BOXES } from "../../src/exhibits/leaning-pendulum/sim";
import { OpticsExhibit, ENTRANCE as OPTICS_ENTRANCE, STATIC_BOXES as OPTICS_BOXES } from "../../src/exhibits/optics/sim";
import { BouncingExhibit, ENTRANCE as BOUNCING_ENTRANCE, STATIC_BOXES as BOUNCING_BOXES } from "../../src/exhibits/bouncing/sim";
import { SingingGlassExhibit, ENTRANCE as SINGING_ENTRANCE, STATIC_BOXES as SINGING_BOXES } from "../../src/exhibits/singing-glass/sim";
import { StairwellExhibit, ENTRANCE as STAIR_ENTRANCE, STATIC_BOXES as STAIR_BOXES, RISE } from "../../src/exhibits/stairwell/sim";
import { CAMERA_POSES as SIDEWAYS_CAMERAS } from "../../src/exhibits/sideways-gravity/view";
import { CAMERA_POSES as PENDULUM_CAMERAS } from "../../src/exhibits/pendulum/view";
import { CAMERA_POSES as LEANING_CAMERAS } from "../../src/exhibits/leaning-pendulum/view";
import { CAMERA_POSES as OPTICS_CAMERAS } from "../../src/exhibits/optics/view";
import { CAMERA_POSES as BOUNCING_CAMERAS } from "../../src/exhibits/bouncing/view";
import { CAMERA_POSES as SINGING_CAMERAS } from "../../src/exhibits/singing-glass/view";
import { CAMERA_POSES as STAIR_CAMERAS } from "../../src/exhibits/stairwell/view";
import type { Box } from "../../src/exhibits/layout";
import { PassageExhibit } from "../../src/exhibits/passage";
import { ChladniExhibit, ENTRANCE as CHLADNI_ENTRANCE, STATIC_BOXES as CHLADNI_BOXES } from "../../src/exhibits/chladni/sim";
import { CAMERA_POSES as CHLADNI_CAMERAS } from "../../src/exhibits/chladni/view";
import { FurnaceExhibit, ENTRANCE as FURNACE_ENTRANCE, STATIC_BOXES as FURNACE_BOXES } from "../../src/exhibits/furnace/sim";
import { CAMERA_POSES as FURNACE_CAMERAS } from "../../src/exhibits/furnace/view";
import { DoubleSlitExhibit, ENTRANCE as SLIT_ENTRANCE, STATIC_BOXES as SLIT_BOXES } from "../../src/exhibits/double-slit/sim";
import { CAMERA_POSES as SLIT_CAMERAS } from "../../src/exhibits/double-slit/view";
import { RutherfordExhibit, ENTRANCE as RUTHERFORD_ENTRANCE, STATIC_BOXES as RUTHERFORD_BOXES } from "../../src/exhibits/rutherford/sim";
import { CAMERA_POSES as RUTHERFORD_CAMERAS } from "../../src/exhibits/rutherford/view";
import { SternGerlachExhibit, ENTRANCE as SG_ENTRANCE, STATIC_BOXES as SG_BOXES } from "../../src/exhibits/stern-gerlach/sim";
import { CAMERA_POSES as SG_CAMERAS } from "../../src/exhibits/stern-gerlach/view";
import { TunnelExhibit, ENTRANCE as TUNNEL_ENTRANCE, STATIC_BOXES as TUNNEL_BOXES } from "../../src/exhibits/tunnel/sim";
import { CAMERA_POSES as TUNNEL_CAMERAS } from "../../src/exhibits/tunnel/view";
import { ENTRANCE as END_ENTRANCE, STATIC_BOXES as END_BOXES } from "../../src/exhibits/the-end/sim";
import { OFFSETS, ROOMS, liveAround, roomAt, roomOwns } from "../../src/galleries/rooms";

let R: typeof RAPIER;
beforeAll(async () => {
  R = await initPhysics();
});

/** Each room in route order: its exhibit, camera poses, entrance and physics boxes. */
const REAL: [() => ExhibitBase, Record<string, unknown>, { x: number }, readonly Box[]][] = [
  [() => new SidewaysGravityExhibit(R), SIDEWAYS_CAMERAS, PLAYER_SPAWN, SIDEWAYS_BOXES],
  [() => new PendulumExhibit(R), PENDULUM_CAMERAS, PENDULUM_ENTRANCE, PENDULUM_BOXES],
  [() => new BouncingExhibit(R), BOUNCING_CAMERAS, BOUNCING_ENTRANCE, BOUNCING_BOXES],
  [() => new LeaningPendulumExhibit(R), LEANING_CAMERAS, LEANING_ENTRANCE, LEANING_BOXES],
  [() => new StairwellExhibit(R), STAIR_CAMERAS, STAIR_ENTRANCE, STAIR_BOXES],
  [() => new OpticsExhibit(R), OPTICS_CAMERAS, OPTICS_ENTRANCE, OPTICS_BOXES],
  [() => new SingingGlassExhibit(R), SINGING_CAMERAS, SINGING_ENTRANCE, SINGING_BOXES],
  [() => new ChladniExhibit(R), CHLADNI_CAMERAS, CHLADNI_ENTRANCE, CHLADNI_BOXES],
  [() => new FurnaceExhibit(R), FURNACE_CAMERAS, FURNACE_ENTRANCE, FURNACE_BOXES],
  [() => new DoubleSlitExhibit(R), SLIT_CAMERAS, SLIT_ENTRANCE, SLIT_BOXES],
  [() => new StairwellExhibit(R, "upper-stair"), { "upper-stair": STAIR_CAMERAS.stairwell }, STAIR_ENTRANCE, STAIR_BOXES],
  [() => new RutherfordExhibit(R), RUTHERFORD_CAMERAS, RUTHERFORD_ENTRANCE, RUTHERFORD_BOXES],
  [() => new SternGerlachExhibit(R), SG_CAMERAS, SG_ENTRANCE, SG_BOXES],
  [() => new TunnelExhibit(R), TUNNEL_CAMERAS, TUNNEL_ENTRANCE, TUNNEL_BOXES],
  [() => new PassageExhibit(R, "the-end", END_BOXES), {}, END_ENTRANCE, END_BOXES],
];

const round = (v: number | undefined) => (v === undefined ? undefined : Math.round(v * 1000) / 1000);
const floorOf = (boxes: readonly Box[], side: string) => boxes.find((b) => b.name === `corridor-${side}-floor`);

describe("room list", () => {
  it("lists every gallery, in order, with its laws and cameras", () => {
    expect(ROOMS).toHaveLength(REAL.length);
    REAL.forEach(([make, cameras, entrance], i) => {
      const museumX = entrance.x + OFFSETS[i].x;
      const ex = make();
      const room = ROOMS[i];
      expect(room.id).toBe(ex.id);
      const laws = ex.rules.filter((r) => r.editable && !r.control).map((r) => r.id);
      expect(room.laws.toSorted()).toEqual(laws.toSorted());
      expect(room.cameras.toSorted()).toEqual(Object.keys(cameras).toSorted());
      // The room owns the floor at its own entrance.
      expect(roomAt(museumX)).toBe(i);
      expect(roomOwns(i, museumX, 0)).toBe(true);
      ex.dispose();
    });
  });

  it("each room's doors are where its corridors really start, so neighbours' corridors meet", () => {
    const measured = REAL.map(([, , , boxes]) => {
      const east = floorOf(boxes, "east");
      const west = floorOf(boxes, "west");
      return {
        east: round(east && east.center[0] - east.half[0]),
        west: round(west && west.center[0] + west.half[0]),
        rise: round(east && west ? west.center[1] - east.center[1] : undefined),
      };
    });
    const declared = ROOMS.map((room) => ({
      east: room.doors.east,
      west: room.doors.west,
      rise: room.doors.east !== undefined && room.doors.west !== undefined ? (room.doors.rise ?? 0) : undefined,
    }));
    expect(measured).toEqual(declared);
    // Placed in the museum, each room's west corridor is exactly the next room's east corridor.
    const joints = REAL.slice(0, -1).map(([, , , boxes], i) => {
      const west = floorOf(boxes, "west")!;
      const next = floorOf(REAL[i + 1][3], "east")!;
      return [
        round(west.center[0] + OFFSETS[i].x - (next.center[0] + OFFSETS[i + 1].x)),
        round(west.center[1] + OFFSETS[i].y - (next.center[1] + OFFSETS[i + 1].y)),
        round(west.center[2] - next.center[2]),
      ];
    });
    expect(joints).toEqual(joints.map(() => [0, 0, 0]));
    expect(ROOMS.find((r) => r.id === "stairwell")!.doors.rise).toBe(RISE);
  });

  it("each floor is a storey above the one below, reached only by the stairs", () => {
    const heights = ROOMS.map((room, i) => ({ floor: room.floor, y: OFFSETS[i].y }));
    for (const { floor, y } of heights) expect(y).toBeCloseTo((floor - 1) * RISE);
  });

  it("every floor x belongs to exactly one room, with hysteresis at the lines", () => {
    for (let x = 5; x > -160; x -= 0.37) {
      const owners = ROOMS.map((_, i) => i).filter((i) => roomOwns(i, x, 0));
      expect(owners).toEqual([roomAt(x)]);
    }
  });

  it("keeps a room and its neighbours live", () => {
    expect(liveAround(0)).toEqual([0, 1]);
    expect(liveAround(3)).toEqual([2, 3, 4]);
    expect(liveAround(ROOMS.length - 1)).toEqual([ROOMS.length - 2, ROOMS.length - 1]);
  });
});
