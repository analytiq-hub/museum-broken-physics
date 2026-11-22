# The Museum of Broken Physics

Three.js + Rapier puzzle game. Vision in [docs/concept.md](docs/concept.md); milestones,
architecture and the development harness in [docs/plan.md](docs/plan.md).

## Commands

| Command | What it does |
| ------- | ------------ |
| `npm run dev` | Vite dev server (http://localhost:5173). Add `?debug` for the FPS meter and debug panel. Keys: arrows/Space set gravity, R reset, P pause, `.` step. |
| `npm run check` | Typecheck + oxlint (warnings fail) + unit tests + step-time benchmark. Must be green before finishing; a Stop hook enforces it. |
| `npm test` | Unit and headless exhibit tests only (`tests/**/*.test.ts`). |
| `npm run bench` | Physics step-time benchmark (`bench/`), prints ms/step. |
| `npm run solve` | Puzzle solver report (every move sequence within budget, at early/settled timings) and trajectory SVGs in `harness/out/`. Solver thresholds themselves are asserted in `tests/exhibits/*.solver.test.ts`. |
| `npm run screenshots` | Starts Vite, drives the real build in headless system Chrome via `window.__game` (`src/debug/api.ts`), and saves PNGs of set states to `harness/out/screens/`. Look at them after visual changes. Add shots in `harness/screenshots.ts`. |
| `npm run ui-check` | End-to-end first-person UI check in headless Chrome with a real pointer lock (enter, hold Q, steer the instrument cursor, click a law, release). Runs in CI. Run it after UI changes. |
| `node harness/record-fixture.ts` | Plays the room in headless Chrome with real key presses and rewrites `tests/replays/sideways-gravity-fixture.json`. Rerun it when a deliberate physics/layout change makes the replay test fail. |
| `npm run build` | Production build to `dist/`. |

CI (`.github/workflows/ci.yml`) runs check + build on every push and PR, and deploys `main`
to GitHub Pages: https://analytiqhub.com/museum-broken-physics/

## The one architectural rule: sim and view are split

- **Sim** = Rapier only. `src/engine/physics.ts`, `src/engine/loop.ts`, every
  `src/exhibits/*/sim.ts`, and anything they import. **No three.js, no DOM.** This is what lets
  exhibits run headlessly in Node for tests, the puzzle solver and replays. A test fails if an
  exhibit's `sim.ts` imports three.js.
- `src/rules/` and `src/exhibits/Exhibit.ts` are sim too. `ExhibitBase` gives every exhibit
  rules + budget (`setRule`), `step()`, `stepUntilSettled()`, `save()`/`load()` of the complete
  state (the solver branches with these), `reset()` and `describe()`.
- `harness/` (solver, trajectory SVGs) is sim-side tooling and runs in Node.
- **View** = three.js. `src/engine/bodySync.ts`, `src/exhibits/*/view.ts`, `src/main.ts`.
  Views read the sim; the sim never knows the view exists.
- Physics runs at a fixed 60 Hz (`FIXED_DT`) via `FixedStepper`; the view interpolates between
  steps. Never step the world from render code with a variable dt.
- Reset = `world.takeSnapshot()` after building, `World.restoreSnapshot()` on reset, then
  `BodySync.rebind(world)` (bodies are matched by handle).

## Adding an exhibit

`src/exhibits/<name>/sim.ts` (build bodies, colliders, rules; pure Rapier) and `view.ts`
(meshes bound to the sim's bodies). Add a headless test in `tests/exhibits/<name>.test.ts`
that replays the intended solution and asserts it is solved, and replays known
non-solutions and asserts they are not.

## UI

- `src/ui/instrumentModel.ts` (pure, tested) turns an exhibit's rules into what the physics
  instrument shows; `src/ui/instrument.ts` renders it. In first person it is raised by holding
  Q: the pointer stays locked and mouse deltas drive a virtual cursor (`look.enabled = false`),
  because re-locking the pointer after releasing it is restricted by browsers. In the window
  view (C) it stays open as a normal panel.
- Player-facing directions are named from the viewer's side: floor, left/right/back wall, window.

## Playtest recordings

Every rule change is recorded with the fixed-step count it happened at (`src/debug/recorder.ts`);
each try at the room is one attempt. In the game, **Shift+D** (or "Download recording" with
`?debug`) saves the session as JSON. Put it in `tests/replays/` and `tests/replays.test.ts`
replays every attempt headlessly and asserts the same outcome and the exact same final ball
position. A stuck or surprising playtest becomes a regression test. If a deliberate change
alters the physics, old recordings will legitimately fail: re-record or delete them.

## Gotchas (add new ones here when you find them)

- **Sleeping bodies ignore gravity changes.** After changing `world.gravity`, call
  `wakeUp()` on every dynamic body.
- **Broken rules are explicit, capped forces**, never out-of-range engine parameters (e.g. no
  negative `linearDamping`; apply a force along velocity with an energy cap instead).
- **Rapier has no rolling friction.** Give rolling bodies angular damping, or they roll metres
  along whichever wall is "down" on leftover spin and early moves become a lottery.
- **Decorative bodies (tell-tales) must not touch puzzle bodies:** use collision groups, and
  override `settleBodies()` so a swaying plumb bob doesn't delay "settled".
- **A joint pivot needs clearance** for the bob in every gravity direction, or it jams in a wall.
- **`world.timestep` reads back as an f32** (0.0166666675, not 1/60). Always pass `FIXED_DT`
  to your own per-step maths (the player), or replays drift from the browser.
- **Resetting closes doors.** Anything standing in a doorway or beyond when the room resets
  must be moved (see `RESET_SPOT`), or it is shut out or stuck inside the door.
- **Fast balls tunnel.** Enable CCD on small fast bodies and make walls at least as thick as
  the ball's radius.
- **TypeScript 7 with `erasableSyntaxOnly`:** no constructor parameter properties, enums or
  namespaces. Declare fields and assign them in the constructor.
- **Lint is oxlint**, not ESLint: typescript-eslint doesn't support TypeScript 7 yet.
- **Don't call `npm run` inside npm scripts.** An ancient npm in `~/node_modules/.bin` shadows
  the real one inside scripts on the main dev machine. Call tools (`tsc`, `vitest`, `oxlint`)
  directly.
- **Rapier `-compat` inlines its WASM**, so the bundle is ~5 MB (~1.8 MB gzipped). Expected.
- **Debug API:** load with `?paused`, then `__game.setRule(...)`, `__game.settle()`,
  `__game.setCamera("overview" | "ledge" | "window")`, `await __game.nextFrame()`. Camera
  poses live in each exhibit's `view.ts` (`CAMERA_POSES`).
- Vite `base` is `"./"` so the build works under the Pages subpath; keep asset URLs relative.
