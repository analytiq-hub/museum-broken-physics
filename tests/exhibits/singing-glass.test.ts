import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../../src/engine/physics";
import { GLASSES, PIPE_LENGTHS, SPEED_LAW, SPEED_MARKS, SingingGlassExhibit } from "../../src/exhibits/singing-glass/sim";
import { CRACK_AT, pipeFrequency, response } from "../../src/exhibits/singing-glass/resonance";
import { instrumentModel } from "../../src/ui/instrumentModel";

let R: typeof RAPIER;
let ex: SingingGlassExhibit;
beforeAll(async () => {
  R = await initPhysics();
});
afterEach(() => ex?.dispose());

const seconds = (s: number) => {
  for (let i = 0; i < s * 60; i++) ex.step();
};
const play = (pipe: number) => ex.setRule("pipe", `${pipe}`);
const stop = () => ex.setRule("pipe", "none");

describe("singing glass", () => {
  it("in air, exactly one pipe matches the pane", () => {
    const matches = PIPE_LENGTHS.map((L) => response(pipeFrequency(SPEED_LAW, L), GLASSES[0])).filter((r) => r > 0.5);
    expect(matches).toHaveLength(1);
  });

  it("solution: restore air, sustain the third pipe; the pane shatters and the way opens", () => {
    ex = new SingingGlassExhibit(R);
    const closedY = ex.pane.translation().y;
    expect(ex.setRule("speed", SPEED_LAW)).toBe(true);
    expect(play(2)).toBe(true);
    expect(ex.changesUsed).toBe(1); // pipes are controls: free
    seconds(4);
    expect(ex.glass("pane").cracked).toBe(true);
    expect(ex.isSolved()).toBe(false);
    seconds(4);
    expect(ex.isSolved()).toBe(true);
    expect(ex.glass("harmonica").amplitude).toBeLessThan(0.1);
    seconds(0.1);
    expect(ex.pane.translation().y).toBeLessThan(closedY - 5);
  });

  it("a short burst of the right pipe isn't enough: the pane needs a sustained tone", () => {
    ex = new SingingGlassExhibit(R);
    ex.setRule("speed", SPEED_LAW);
    play(2);
    seconds(3);
    stop();
    seconds(5);
    play(2);
    seconds(3);
    expect(ex.isSolved()).toBe(false);
  });

  it("under the broken law, playing every pipe in turn cracks, then shatters, the harmonica", () => {
    ex = new SingingGlassExhibit(R);
    for (let p = 0; p < 5 && !ex.isFailed(); p++) {
      play(p);
      seconds(4);
    }
    expect(ex.isFailed()).toBe(true);
    expect(ex.glass("harmonica").broken).toBe(true);
    expect(ex.isSolved()).toBe(false);
  });

  it("the harmonica cracks within about a second; stopping at the crack saves it", () => {
    ex = new SingingGlassExhibit(R);
    play(3);
    let t = 0;
    while (!ex.glass("harmonica").cracked && t < 300) {
      ex.step();
      t++;
    }
    expect(t / 60).toBeLessThan(1.5);
    stop();
    seconds(10);
    expect(ex.isFailed()).toBe(false);
    expect(ex.glass("harmonica").amplitude).toBeLessThan(CRACK_AT / 4);
  });

  it("carbon dioxide and helium ring a decoy, which never cracks", () => {
    for (const [speed, pipe, decoy] of [
      [259, 2, "decoy-goblet"],
      [972, 1, "decoy-flute"],
    ] as const) {
      ex = new SingingGlassExhibit(R);
      ex.setRule("speed", speed);
      play(pipe);
      seconds(20);
      expect(ex.glass(decoy).amplitude).toBeGreaterThan(0.3);
      expect(ex.glass(decoy).cracked).toBe(false);
      expect(ex.isSolved() || ex.isFailed()).toBe(false);
      ex.dispose();
    }
    ex = new SingingGlassExhibit(R);
  });

  it("brute force: of every speed and pipe held for 20 s, only air and the third pipe open the way", () => {
    const solved: string[] = [];
    for (const { value: speed } of SPEED_MARKS) {
      for (let p = 0; p < 5; p++) {
        ex = new SingingGlassExhibit(R);
        if (speed !== ex.rule("speed").current) ex.setRule("speed", speed);
        play(p);
        seconds(20);
        if (ex.isSolved()) solved.push(`${speed}:${p}`);
        ex.dispose();
      }
    }
    expect(solved).toEqual([`${SPEED_LAW}:2`]);
    ex = new SingingGlassExhibit(R);
  }, 60_000);

  it("the instrument shows the speed of sound, not the pipes, and doesn't name the law", () => {
    ex = new SingingGlassExhibit(R);
    const m = instrumentModel(ex, "The Singing Glass");
    expect(m.rules.map((r) => r.id)).toEqual(["speed"]);
    expect(m.rules[0].explanation).not.toContain("343");
  });
});
