// Replays every recorded session in tests/replays/ headlessly and checks each
// attempt ends exactly as it did in the browser. Drop a playtester's recording
// (Shift+D in the game) here to keep a stuck or surprising session as a test.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type RAPIER from "@dimforge/rapier3d-compat";
import { initPhysics } from "../src/engine/physics";
import type { Recording } from "../src/debug/recorder";
import { EXHIBITS, replayAttempt } from "../harness/replay";

const DIR = "tests/replays";
const recordings = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ file: f, recording: JSON.parse(readFileSync(join(DIR, f), "utf8")) as Recording }));

let R: typeof RAPIER;
beforeAll(async () => {
  R = await initPhysics();
});

describe.each(recordings)("replay $file", ({ recording }) => {
  const finished = recording.attempts.filter((a) => a.outcome !== "in-progress");

  it.each(finished.map((attempt, i) => ({ i: i + 1, attempt })))(
    "attempt $i ($attempt.outcome) replays identically",
    ({ attempt }) => {
      const make = EXHIBITS[recording.exhibit];
      expect(make, `unknown exhibit "${recording.exhibit}"`).toBeDefined();
      const ex = make(R);
      const { state, rejected } = replayAttempt(ex, attempt);
      ex.dispose();

      const outcome = state.solved ? "solved" : state.failed ? "failed" : "reset";
      expect(rejected).toBe(0);
      expect(outcome).toBe(attempt.outcome);
      // Same WASM, same fixed steps: the ball should be exactly where the browser left it.
      expect(state.bodies.ball.pos).toEqual(attempt.ball);
    },
  );
});
