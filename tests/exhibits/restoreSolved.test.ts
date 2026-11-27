// Saved progress puts solved rooms back as the player left them: laws right,
// solved, door open, nothing torn or broken. Reset still starts the puzzle over.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import type { ExhibitBase } from "../../src/exhibits/Exhibit";
import { SidewaysGravityExhibit, TARGET } from "../../src/exhibits/sideways-gravity/sim";
import { PendulumExhibit } from "../../src/exhibits/pendulum/sim";
import { LeaningPendulumExhibit } from "../../src/exhibits/leaning-pendulum/sim";
import { OpticsExhibit } from "../../src/exhibits/optics/sim";
import { BouncingExhibit } from "../../src/exhibits/bouncing/sim";
import { SingingGlassExhibit } from "../../src/exhibits/singing-glass/sim";
import { ChladniExhibit } from "../../src/exhibits/chladni/sim";
import { FurnaceExhibit } from "../../src/exhibits/furnace/sim";
import { DoubleSlitExhibit } from "../../src/exhibits/double-slit/sim";
import { RutherfordExhibit } from "../../src/exhibits/rutherford/sim";
import { SternGerlachExhibit } from "../../src/exhibits/stern-gerlach/sim";
import { TunnelExhibit } from "../../src/exhibits/tunnel/sim";
import { SlowLightExhibit } from "../../src/exhibits/slow-light/sim";
import { GalileoExhibit } from "../../src/exhibits/galileo/sim";
import { VaultExhibit } from "../../src/exhibits/vault/sim";

let R: typeof RAPIER;
beforeAll(async () => {
  R = await initPhysics();
});

type WithDoor = ExhibitBase & { door: RAPIER.RigidBody };
const exhibits: [string, () => WithDoor][] = [
  ["Gallery I", () => new SidewaysGravityExhibit(R)],
  ["Gallery II", () => new PendulumExhibit(R)],
  ["Gallery III", () => new LeaningPendulumExhibit(R)],
  ["Gallery IV", () => new OpticsExhibit(R)],
  ["Gallery V", () => new BouncingExhibit(R)],
  ["Gallery VI", () => new SingingGlassExhibit(R)],
  ["Gallery VII", () => new ChladniExhibit(R)],
  ["Gallery VIII", () => new FurnaceExhibit(R)],
  ["Gallery IX", () => new DoubleSlitExhibit(R)],
  ["Gallery X", () => new RutherfordExhibit(R)],
  ["Gallery XI", () => new SternGerlachExhibit(R)],
  ["Gallery XII", () => new TunnelExhibit(R)],
  ["Gallery XIII", () => new SlowLightExhibit(R)],
  ["Gallery XIV", () => new GalileoExhibit(R)],
  ["Gallery XV", () => new VaultExhibit(R)],
];

describe("restoreSolved", () => {
  for (const [name, make] of exhibits) {
    it(`${name}: solved, laws right, door open; and it stays solved`, () => {
      const ex = make();
      const closedY = ex.door.translation().y;
      ex.restoreSolved();
      expect(ex.isSolved()).toBe(true);
      expect(ex.isFailed()).toBe(false);
      const laws = ex.rules.filter((rule) => !rule.control);
      expect(laws.map((rule) => rule.current)).toEqual(laws.map((rule) => rule.nominal));
      expect(ex.changesUsed).toBe(0);
      expect(ex.door.translation().y).toBeLessThan(closedY - 1);
      for (let i = 0; i < 600; i++) ex.step();
      expect(ex.isSolved()).toBe(true);
      expect(ex.isFailed()).toBe(false);
      ex.reset();
      expect(ex.isSolved()).toBe(false);
      expect(ex.door.translation().y).toBeCloseTo(closedY);
      ex.dispose();
    });
  }

  it("Gallery I: the marble rests on the brass plate", () => {
    const ex = new SidewaysGravityExhibit(R);
    ex.restoreSolved();
    const p = ex.ball.translation();
    for (const [i, v] of [p.x, p.y, p.z].entries()) expect(Math.abs(v - TARGET.center[i])).toBeLessThan(TARGET.half[i]);
    expect(ex.isSettled()).toBe(true);
    ex.dispose();
  });
});
