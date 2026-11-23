// `npm run solve`: Gallery III's solver results (moves on both laws).
import { expect, it } from "vitest";
import { initPhysics } from "../src/engine/physics";
import { LeaningPendulumExhibit } from "../src/exhibits/leaning-pendulum/sim";
import { formatSequence, solve } from "./solver";
import { LEANING_SOLVER, LEANING_SOLVER_MAX_MOVES } from "./solverConfigs";

it("leaning pendulum solver report", async () => {
  const R = await initPhysics();
  const ex = new LeaningPendulumExhibit(R);
  const t0 = performance.now();
  const r = solve(ex, { ...LEANING_SOLVER, maxMoves: LEANING_SOLVER_MAX_MOVES });
  const ms = performance.now() - t0;
  ex.dispose();
  console.log(
    [
      `Leaning Pendulum: ${r.sequences} sequences of up to ${LEANING_SOLVER_MAX_MOVES} moves on gravity and damping`,
      `  solved     ${r.solutions.length} (${((100 * r.solutions.length) / r.sequences).toFixed(1)}%)`,
      `  failed     ${r.failures}`,
      `  unresolved ${r.unresolved}`,
      `  ${r.steps.toLocaleString()} physics steps in ${(ms / 1000).toFixed(1)} s`,
      "Solutions:",
      ...r.solutions.map((s) => `  ${formatSequence(s)}`),
    ].join("\n"),
  );
  expect(r.sequences).toBeGreaterThan(0);
});
