// Until a law is discovered, the instrument shows only its reading and the rule's
// observe() text. That text must not give the answer away, so it is the same for
// every option the instrument offers, apart from the value itself: it may say what
// the quantity does, never whether this value is odd, extreme, or the right one.
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import type { ExhibitBase } from "../../src/exhibits/Exhibit";
import { SidewaysGravityExhibit } from "../../src/exhibits/sideways-gravity/sim";
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

const exhibits: [string, () => ExhibitBase][] = [
  ["Sideways Gallery", () => new SidewaysGravityExhibit(R)],
  ["Restless Pendulum", () => new PendulumExhibit(R)],
  ["Leaning Pendulum", () => new LeaningPendulumExhibit(R)],
  ["Hidden Door", () => new OpticsExhibit(R)],
  ["Bouncing Hall", () => new BouncingExhibit(R)],
  ["Singing Glass", () => new SingingGlassExhibit(R)],
  ["Chladni Plates", () => new ChladniExhibit(R)],
  ["Backwards Furnace", () => new FurnaceExhibit(R)],
  ["Young's Double Slit", () => new DoubleSlitExhibit(R)],
  ["Rutherford's Gold Foil", () => new RutherfordExhibit(R)],
  ["Stern–Gerlach", () => new SternGerlachExhibit(R)],
  ["Quantum Tunnel", () => new TunnelExhibit(R)],
  ["Slow Light", () => new SlowLightExhibit(R)],
  ["Galileo's Ledge", () => new GalileoExhibit(R)],
  ["Silver Vault", () => new VaultExhibit(R)],
];

describe("instrument readings don't give the answer away", () => {
  for (const [name, make] of exhibits) {
    it(`${name}: the reading text is the same for every option`, () => {
      const ex = make();
      for (const rule of ex.rules) {
        if (rule.control || !rule.observe) continue;
        const choices = rule.options ?? rule.marks ?? [];
        const texts = choices.map((o) => rule.observe!(o.value).replaceAll(String(o.value), "#"));
        for (const text of texts) expect(`${rule.id}: ${text}`).toBe(`${rule.id}: ${texts[0]}`);
      }
    });
  }

  it("no option label calls itself the true value", () => {
    for (const [, make] of exhibits) {
      for (const rule of make().rules) {
        if (rule.control) continue;
        for (const o of rule.options ?? rule.marks ?? []) expect(`${rule.id}: ${o.label}`).not.toMatch(/\b(true|correct|normal|real)\b/i);
      }
    }
  });
});
