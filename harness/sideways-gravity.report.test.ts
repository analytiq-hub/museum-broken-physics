// `npm run solve`: prints the solver report for the sideways-gravity room and
// writes trajectory SVGs to harness/out/. Thresholds are asserted separately in
// tests/exhibits/sideways-gravity.solver.test.ts; this is for people (and Claude).
import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { initPhysics } from "../src/engine/physics";
import type { GravityDirection } from "../src/rules/Rule";
import {
  BALL_START,
  GRAVITY_OPTIONS,
  LEDGE,
  ROOM,
  SidewaysGravityExhibit,
  TARGET,
} from "../src/exhibits/sideways-gravity/sim";
import { formatSequence, solve } from "./solver";
import { type Marker, type Point, trajectorySvg } from "./trajectory";

const OUT = "harness/out";

it("sideways-gravity solver report", async () => {
  const R = await initPhysics();

  const ex = new SidewaysGravityExhibit(R);
  const t0 = performance.now();
  const r = solve(ex, { ruleId: "gravity", values: GRAVITY_OPTIONS, maxMoves: ex.budget });
  const ms = performance.now() - t0;
  ex.dispose();

  const lines = [
    `Sideways gravity: ${r.sequences} sequences within a budget of 4 (waits: early / settled)`,
    `  solved     ${r.solutions.length} (${((100 * r.solutions.length) / r.sequences).toFixed(1)}%)`,
    `  failed     ${r.failures}`,
    `  unresolved ${r.unresolved}`,
    `  ${r.steps.toLocaleString()} physics steps in ${(ms / 1000).toFixed(1)} s`,
    `Solutions:`,
    ...r.solutions.map((s) => `  ${formatSequence(s)}`),
  ];
  console.log(lines.join("\n"));
  expect(r.sequences).toBeGreaterThan(0);

  mkdirSync(OUT, { recursive: true });
  for (const [name, moves] of [
    ["intended", ["north", "west", "down"]],
    ["just-down", ["down"]],
    ["north-then-down", ["north", "down"]],
  ] as [string, GravityDirection[]][]) {
    const file = `${OUT}/sideways-gravity-${name}.svg`;
    writeFileSync(file, record(R, name, moves));
    console.log(`wrote ${file}`);
  }
});

function record(R: Awaited<ReturnType<typeof initPhysics>>, name: string, moves: GravityDirection[]): string {
  const ex = new SidewaysGravityExhibit(R);
  const path: Point[] = [];
  const markers: Marker[] = [{ at: [BALL_START.x, BALL_START.y, BALL_START.z], label: "start (gravity east)" }];
  const here = (): Point => {
    const p = ex.ball.translation();
    return [p.x, p.y, p.z];
  };
  for (const move of moves) {
    ex.setRule("gravity", move);
    markers.push({ at: here(), label: move });
    while (!ex.isSettled() && !ex.isFailed() && ex.stepCount < 3000) {
      ex.step();
      path.push(here());
    }
  }
  for (let i = 0; i < 60; i++) {
    ex.step();
    path.push(here());
  }
  const outcome = ex.isSolved() ? "solved" : ex.isFailed() ? "failed" : "unresolved";
  markers.push({ at: here(), label: outcome });
  ex.dispose();

  return trajectorySvg({
    title: `Sideways gravity: ${name} (${moves.join(" → ")}) — ${outcome}`,
    room: { halfX: ROOM.halfX, halfZ: ROOM.halfZ, height: ROOM.height },
    boxes: [
      { center: LEDGE.center, half: LEDGE.half, fill: "#d8cfbd" },
      // The brass plate on the ledge top (the sensor box itself extends above it).
      {
        center: [TARGET.center[0], LEDGE.center[1] + LEDGE.half[1] + 0.04, TARGET.center[2]],
        half: [TARGET.half[0], 0.04, TARGET.half[2]],
        fill: "#d4a54a",
      },
    ],
    path,
    markers,
  });
}
