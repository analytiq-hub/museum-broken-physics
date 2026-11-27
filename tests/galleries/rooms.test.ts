// The room list (src/galleries/rooms.ts) describes galleries without building them,
// so it must stay in step with the real thing: laws, cameras, and who owns which floor.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import type { ExhibitBase } from "../../src/exhibits/Exhibit";
import { SidewaysGravityExhibit, PLAYER_SPAWN } from "../../src/exhibits/sideways-gravity/sim";
import { PendulumExhibit, ENTRANCE as PENDULUM_ENTRANCE } from "../../src/exhibits/pendulum/sim";
import { LeaningPendulumExhibit, ENTRANCE as LEANING_ENTRANCE } from "../../src/exhibits/leaning-pendulum/sim";
import { OpticsExhibit, ENTRANCE as OPTICS_ENTRANCE } from "../../src/exhibits/optics/sim";
import { BouncingExhibit, ENTRANCE as BOUNCING_ENTRANCE } from "../../src/exhibits/bouncing/sim";
import { SingingGlassExhibit, ENTRANCE as SINGING_ENTRANCE } from "../../src/exhibits/singing-glass/sim";
import { CAMERA_POSES as SIDEWAYS_CAMERAS } from "../../src/exhibits/sideways-gravity/view";
import { CAMERA_POSES as PENDULUM_CAMERAS } from "../../src/exhibits/pendulum/view";
import { CAMERA_POSES as LEANING_CAMERAS } from "../../src/exhibits/leaning-pendulum/view";
import { CAMERA_POSES as OPTICS_CAMERAS } from "../../src/exhibits/optics/view";
import { CAMERA_POSES as BOUNCING_CAMERAS } from "../../src/exhibits/bouncing/view";
import { CAMERA_POSES as SINGING_CAMERAS } from "../../src/exhibits/singing-glass/view";
import { ROOMS, liveAround, roomAt, roomOwns } from "../../src/galleries/rooms";

let R: typeof RAPIER;
beforeAll(async () => {
  R = await initPhysics();
});

const REAL: [() => ExhibitBase, Record<string, unknown>, { x: number }][] = [
  [() => new SidewaysGravityExhibit(R), SIDEWAYS_CAMERAS, PLAYER_SPAWN],
  [() => new PendulumExhibit(R), PENDULUM_CAMERAS, PENDULUM_ENTRANCE],
  [() => new LeaningPendulumExhibit(R), LEANING_CAMERAS, LEANING_ENTRANCE],
  [() => new OpticsExhibit(R), OPTICS_CAMERAS, OPTICS_ENTRANCE],
  [() => new BouncingExhibit(R), BOUNCING_CAMERAS, BOUNCING_ENTRANCE],
  [() => new SingingGlassExhibit(R), SINGING_CAMERAS, SINGING_ENTRANCE],
];

describe("room list", () => {
  it("lists every gallery, in order, with its laws and cameras", () => {
    expect(ROOMS).toHaveLength(REAL.length);
    REAL.forEach(([make, cameras, entrance], i) => {
      const ex = make();
      const room = ROOMS[i];
      expect(room.id).toBe(ex.id);
      const laws = ex.rules.filter((r) => r.editable && !r.control).map((r) => r.id);
      expect(room.laws.toSorted()).toEqual(laws.toSorted());
      expect(room.cameras.toSorted()).toEqual(Object.keys(cameras).toSorted());
      // The room owns the floor at its own entrance.
      expect(roomAt(entrance.x)).toBe(i);
      expect(roomOwns(i, entrance.x, 0)).toBe(true);
      ex.dispose();
    });
  });

  it("every floor x belongs to exactly one room, with hysteresis at the lines", () => {
    for (let x = 5; x > -110; x -= 0.37) {
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
