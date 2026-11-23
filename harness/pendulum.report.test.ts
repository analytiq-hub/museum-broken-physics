// `npm run solve` (with the sideways report): the pendulum's solver results.
import { expect, it } from "vitest";
import { initPhysics } from "../src/engine/physics";
import { PendulumExhibit } from "../src/exhibits/pendulum/sim";
import { formatSequence, solve } from "./solver";
import { PENDULUM_SOLVER } from "./solverConfigs";

it("pendulum solver report", async () => {
  const R = await initPhysics();
  const ex = new PendulumExhibit(R);
  const t0 = performance.now();
  const r = solve(ex, { ...PENDULUM_SOLVER, maxMoves: ex.budget });
  const ms = performance.now() - t0;
  ex.dispose();
  console.log(
    [
      `Restless Pendulum: ${r.sequences} sequences within a budget of ${ex.budget} (damping marks × start times × waits)`,
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
