import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { DoubleSlitExhibit, INDEX_MARKS, LAW, SENSOR_Y, WAVELENGTH_MARKS } from "../../src/exhibits/double-slit/sim";
import { spacing } from "../../src/exhibits/double-slit/fringes";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: DoubleSlitExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60 && !ex.isSolved(); i++) ex.step();
};

describe("double slit", () => {
  it("the true pattern's bands are 15 cm apart, and the sensor sits six bands out", () => {
    expect(spacing({ ...LAW, observed: false })).toBeCloseTo(0.15, 2);
    expect(SENSOR_Y).toBeCloseTo(0.9, 1);
  });

  it("starts dark at the sensor; restoring either law alone leaves it dark", () => {
    ex = new DoubleSlitExhibit(R);
    expect(ex.sensorLit).toBe(false);
    ex.setRule("wavelength", LAW.wavelength);
    expect(ex.sensorLit).toBe(false);
    ex.dispose();
    ex = new DoubleSlitExhibit(R);
    ex.setRule("index", LAW.index);
    expect(ex.sensorLit).toBe(false);
  });

  it("solution: restore both laws; the sensor lights and the way on opens", () => {
    ex = new DoubleSlitExhibit(R);
    const closedY = ex.door.translation().y;
    ex.setRule("index", LAW.index);
    ex.setRule("wavelength", LAW.wavelength);
    expect(ex.sensorLit).toBe(true);
    seconds(3);
    expect(ex.isSolved()).toBe(true);
    for (let i = 0; i < 90; i++) ex.step();
    expect(ex.door.translation().y).toBeLessThan(closedY - 2);
  });

  it("watching the slits wipes out the bands: the sensor goes dark", () => {
    ex = new DoubleSlitExhibit(R);
    ex.setRule("index", LAW.index);
    ex.setRule("wavelength", LAW.wavelength);
    ex.setRule("observer", "on");
    expect(ex.changesUsed).toBe(2); // the observer is a control: free
    expect(ex.sensorLight).toBe(0.5);
    seconds(5);
    expect(ex.isSolved()).toBe(false);
  });

  it("no near misses: of every combination of marks, only the laws light it; the rest stay under half", () => {
    ex = new DoubleSlitExhibit(R);
    const lit: string[] = [];
    let brightestWrong = 0;
    for (const w of WAVELENGTH_MARKS) for (const n of INDEX_MARKS) {
      ex.rule("wavelength").current = w.value;
      ex.rule("index").current = n.value;
      if (ex.sensorLit) lit.push(`${w.value}/${n.value}`);
      else brightestWrong = Math.max(brightestWrong, ex.sensorLight);
    }
    expect(lit).toEqual([`${LAW.wavelength}/${LAW.index}`]);
    expect(brightestWrong).toBeLessThan(0.5);
  });

  it("the instrument lists both laws and the gravity, not the observer, and names neither law", () => {
    ex = new DoubleSlitExhibit(R);
    const m = instrumentModel(ex, "Young's Double Slit");
    expect(m.rules.map((r) => r.id)).toEqual(["wavelength", "index", "gravity"]);
    expect(m.rules[0].explanation).not.toContain("589");
    expect(m.rules[1].explanation).not.toContain("1.33");
  });
});
