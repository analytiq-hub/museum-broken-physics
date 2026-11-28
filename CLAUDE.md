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
| `npm run screenshots` | Starts Vite, drives the real build in headless system Chrome via `window.__game` (`src/debug/api.ts`), and saves PNGs of set states to `harness/out/screens/`. Look at them after visual changes. Add shots in `harness/screenshots.ts`; `node harness/screenshots.ts 7` takes only shots named `7…`. |
| `npm run ui-check` | End-to-end first-person UI check in headless Chrome with a real pointer lock (enter, hold Q, steer the instrument cursor, click a law, release). Runs in CI. Run it after UI changes. |
| `node harness/record-pendulum-fixture.ts` | Same for Gallery II via the debug API (rewrites `tests/replays/pendulum-fixture.json`). |
| `node harness/record-fixture.ts` | Plays the room in headless Chrome with real key presses and rewrites `tests/replays/sideways-gravity-fixture.json`. Rerun it when a deliberate physics/layout change makes the replay test fail. |
| `node harness/preview-image.ts` | Renders 1200×630 link-preview candidates (HUD hidden, title overlaid) to `harness/out/preview/`; copy the chosen one to `public/og-image.jpg`. |
| `node harness/record-video.ts` | Records a 13 s, 1600×900 clip of Young's Double Slit being solved, the whole room in view (camera `double-slit-wide`; the instrument fades in for each real click, drawn cursor, fixed steps per frame) to `harness/out/video/double-slit.mp4` via ffmpeg. ~20 min (software rendering); `--still` saves one frame to check the framing. |
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

## Galleries

- Each gallery is an exhibit with **its own physics world** (`src/exhibits/<name>/sim.ts`) and
  a descriptor in `src/galleries/` (view, recorder, HUD lines, sounds, reset rules). `main.ts`
  steps only the active gallery's world.
- **Galleries are streamed.** `src/galleries/rooms.ts` lists every room as data (id, title,
  laws it teaches, camera names, `load()` importing its own chunk); `main.ts` builds only the
  active room and its neighbours, frees the rest (`src/render/dispose.ts`; shared materials
  stay), and rebuilds a solved room solved. Adding a gallery = add it to `ROOMS` (the room
  list test checks laws, cameras and floor ownership) and to `HANDOVERS`. Nothing outside the
  gallery's chunk may import its module statically, or it lands in the first load.
- `npm run build` ends with `harness/budget.ts`: first-load JS+CSS, each room's chunk, and
  `public/assets` have size budgets; CI fails over budget.
- Galleries are joined by corridors that exist in **both** worlds (each room builds its own
  stubs with `corridor("east" | "west", outerX, y)` in `src/exhibits/layout.ts`; views skip
  `corridor-east-*`, which the room to the east draws);
  the player is handed over at the corridor midpoint (`HANDOVER_X`, with hysteresis), and the
  arrival is recorded so replays can follow (`Recorder.playerArrived`).
- R resets only the gallery the player is in. `src/state/gameState.ts` records solved galleries.
- **The route is fixed and runs in floors** (`src/galleries/rooms.ts`, in order). Floor 1,
  mechanics: Galleries I–IV. The Grand Stair (a passage, `kind: "passage"`, no puzzle).
  Floor 2, waves, light and heat, 4.8 m up: Galleries V–IX. The Upper Stair. Floor 3, modern
  physics, 9.6 m up: Galleries X–XV. Then `the-end`, a small passage room with the
  closing placard: new galleries go before it. Each floor is a level; harder going up. Rooms keep the coordinates they were built in, and `OFFSETS` places each one in the
  museum. The player runs in the active room's own coordinates and is shifted at each handover;
  the camera, light culling, handover and `getPlayer().feet` use museum coordinates.
  `__game.setPlayerIn(roomId, localFeet, …)` takes a room's own coordinates.
- Gallery I: the Sideways Gallery (gravity direction, console + instrument).
  Gallery II: the Restless Pendulum (negative damping, instrument only; damping is a "range"
  rule whose named `marks` are what the instrument offers and the solver samples).
  Gallery III: the Bouncing Hall (bounciness above 1: Rapier bounces elastically and an
  explicit capped boost scales each upward rebound; a 45° deflector throws the ball onto a
  felt balcony that soaks up sideways speed; the lever is a control with a fixed value).
  Gallery IV: the Leaning Pendulum (both laws broken; the pendulum tears loose if it swings
  more than 65° from gravity's hanging direction, so gravity must come home in stages).
  Gallery V: the Hidden Door (optics: a beam traced in 2D by `src/exhibits/optics/trace.ts`;
  the broken law is the prism's refractive index; mirrors are **control** rules).
  Gallery VI: the Singing Glass (the speed of sound; pipes play v / 2L; each glass's ring is an
  envelope integrated exactly in `src/exhibits/singing-glass/resonance.ts`, no Rapier; organ
  pipes are toggle controls via `offValue`; the pane is the exit and the harmonica the fail).
  Gallery VII: the Chladni Plates (speed of sound in brass; plate modes in `chladni/plate.ts`;
  sand is a view-side random walk drawn as density; keys are `offValue` toggles).
  Gallery VIII: the Backwards Furnace (heat flows cold → hot; a lumped network where each
  object exchanges heat with the room reservoir, `furnace/heat.ts`; latent heat for the ice).
  Gallery IX: Young's Double Slit, Floor 2's finale (wavelength and the tank's index, both
  broken; closed-form fringes in `double-slit/fringes.ts`; marks searched for no near misses).
  Gallery X: Rutherford's Gold Foil (the atom's charge: spread vs nucleus; 2D Coulomb
  scattering with velocity Verlet in `rutherford/scatter.ts`; phosphor tracks drawn on a canvas).
  Gallery XI: Stern–Gerlach (spin's quantisation, shared with Gallery XV in `exhibits/spin.ts`:
  any value along the field smears, two values split cleanly, three values crack the middle
  cell; word it as a value *along the magnet's field*, never "any direction", which reads as
  the axis being arbitrary). Gallery XII: the Quantum Tunnel (Planck's constant; a
  three-compartment probability leak in `tunnel/leak.ts`; restoring the law measures the marble).
  Gallery XIII: Slow Light (light at 4 m/s; a coincidence lock wants one flash to light a near
  cell and a far, shuttered cell together; flashes in flight are sim state; the lamp is a
  `cycle` control whose every click fires it, ignored while it recharges).
  Gallery XIV: Galileo's Ledge (cork's gravitational mass is half its inertial mass: Rapier
  `setGravityScale` on the cork ball; one kick sends both balls off a frictionless ledge, and
  only under the broken law does cork fly into the far pan; restore the law afterwards so the
  balance reads level. Order matters: restored first, cork lands short).
  Gallery XV: the Silver Vault, Floor 3's finale (spin and Planck's constant, both broken; a
  one-pellet oven; the upper spin half lands on a glass wall and tunnels into the vault via
  `tunnel/leak.ts`; restoring Planck's constant measures it; two changes, so a decoy is a dead end).
- **New rooms:** `roomShell()`/`doorBox()`/`doorY()` in `layout.ts` build a standard room with
  its corridor stubs and sinking west door; `PassageExhibit` is a room with nothing to solve.
  Pure-maths models (no Rapier) go in their own module beside `sim.ts`, like `trace.ts`.
- **Control rules** (`control: true`, e.g. a mirror's angle) cost nothing from the budget and
  aren't listed on the instrument; they're operated in the world by click targets, either
  `cycle: true` (each click steps to the next option) or a fixed `value` (the lever; its
  `doneLabel` is what the crosshair says once it's set).
- Pendulum rooms share one view builder (`buildPendulumRoom` in `src/exhibits/pendulum/view.ts`)
  driven by a spec. Corridor geometry is drawn by the gallery on its east side (each view's
  `skip` lists the prefixes another gallery draws).
- The solver can change several rules (`moves: [{rule, value}]`); per-exhibit settings live
  in `harness/solverConfigs.ts`, shared by the threshold tests and `npm run solve`.

## UI

- `src/ui/instrumentModel.ts` (pure, tested) turns an exhibit's rules into what the physics
  instrument shows. **It never gives the answer away:** until a law is discovered (the player
  solved a room where it was editable; `knownLaws()` in `main.ts`) it shows only the reading and
  the rule's `observe()` text, with no law, Broken/OK chip, highlighted option or Restore button.
  Write `observe()` for every new rule so it reads the **same for every option** (only the value
  itself may change): say what the quantity does, never judge the current value ("enormous",
  "negative", "every swing gets bigger") or hint which is right, and never echo the right option's wording (spin's once said atoms are pushed
  "up or down"). Option labels must not call one value true or normal, or another too slow or
  backwards. `tests/exhibits/readings.test.ts` enforces both; `src/ui/instrument.ts` renders it. In first person it is raised by holding
  Q: the pointer stays locked and mouse deltas drive a virtual cursor (`look.enabled = false`),
  because re-locking the pointer after releasing it is restricted by browsers. In the window
  view (C) it stays open as a normal panel.
- Player-facing directions are named from the viewer's side: floor, left/right/back wall, window.
- **Touch mode** (`src/ui/touchControls.ts`, `body.touch`): on automatically for touchscreens
  without a mouse, `?touch` forces it. Left-thumb floating joystick, right-thumb drag to look,
  tap to use in-world controls (raycast from the tap, no crosshair), Laws/Reset buttons; the
  instrument is a normal panel down the right. No pointer lock. Defaults to `?quality=low`
  (`?quality=high` overrides). `npm run ui-check` drives it on an emulated phone with real
  touch events.

- **Saved progress** (`src/state/progress.ts`): solved galleries and the current gallery go to
  `localStorage` on each solve and gallery change. A returning visitor gets a "Welcome back"
  card with the visitor's ticket (also on the pause card); Continue calls each solved
  exhibit's `restoreSolved()` (laws to nominal, `arrangeSolved()`, ~5 s of steps so the door is
  open) and puts the player at the gallery they were in. Every exhibit must implement
  `arrangeSolved()`; `tests/exhibits/restoreSolved.test.ts` covers them. Restored rooms aren't
  recorded until reset (`Recorder.skipUntilReset`). `?automation` ignores saved progress.

- **GitHub link** (`src/ui/repoLink.ts`): the title, welcome-back and pause cards end with
  "★ N · Source on GitHub" (no number below 10 stars). The count is baked in at build time
  (`BUILD_REPO_STARS`, a Vite `define` from `REPO_STARS`, which CI reads from the GitHub API)
  and refreshed live on load, cached in `localStorage` for an hour; `?automation` skips the
  fetch. The overlay's click handler ignores clicks on the link, so it doesn't enter the game.

- **Pausing:** Esc (it releases the pointer lock), the ❚❚ touch button, or leaving the tab
  pauses the game (`menuPaused` in `main.ts`): no steps, sound suspended, a "Paused" card;
  clicking/tapping it resumes without simulating the time spent paused. Separate from the
  debug pause (P / `?paused`).

## Rendering and sound

- `src/render/materials.ts`: shared PBR materials. Marble/plaster textures and the HDRI are CC0
  from Poly Haven in `public/assets/` (credits in `public/assets/CREDITS.md`); brass scratches,
  wood, labels and placards are procedural canvas textures. `worldBoxGeometry` gives boxes
  world-scale UVs so textures tile at real size and line up across boxes.
- `src/render/post.ts`: half-resolution bloom + tone mapping. `?quality=low` disables bloom,
  uses a 1024 shadow map and pixel ratio 1.
- `src/audio/sound.ts`: all sounds are synthesized with WebAudio (no files); audio starts on
  the first click/key. M mutes.
- Lighting budget: one shadow-casting spot (the key), everything else unshadowed. A frame is
  ~115 draw calls / 11k triangles.

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
- **No lights straight above shiny things the player looks down at.** An overhead light (or a
  bright emissive panel) mirrors off the brass console into the player's eyes from anywhere, and
  bloom makes it a blaze. Light the room from the sides and corners; keep ceiling panels dim.
- **`renderer.info` resets per render call**, and post-processing renders several passes. It is
  set to reset once per frame in `main.ts`, so `__game.getRenderInfo()` reports whole frames.
- **Corridors stop at the walls' outer faces.** A corridor box that runs on to a room's inner
  wall face puts its end cap in the same plane as the visible wall around the doorway, and the
  two flicker (z-fighting). Corridor 4–5 did this until a playtester saw the ceiling flicker.
- **Shared geometry is drawn once.** Corridor boxes are in both galleries' physics worlds, but
  only the eastern gallery's view draws them (the western one lists them in `skip`), or they
  z-fight.
- **Removing a joint is part of the world snapshot.** A torn-loose pendulum (joint removed)
  comes back on `reset()`/`load()` because the snapshot includes joints; keep any "torn" flag
  in `saveExtra()` so state and world agree.
- **Wait for the game's lock handler, not the browser's.** `document.pointerLockElement` is set
  before the game's `lock` event runs; a test that moves on at once can race it. Wait for the
  overlay to hide too.
- **A pendulum never "settles".** Solver runs for it use fixed waits and a terminal horizon,
  and the robustness check models a player reacting to an event (the bell), not a clock.
- **The camera follows the player on the next frame.** After `__game.setPlayer`, await
  `nextFrame()` before anything that reads the camera (`lookAtButton`, raycasts).
- **Tap detection uses `PointerEvent.timeStamp`**, not the time it was handled: on a slow frame
  a quick tap would otherwise look like a long press. Injected test touches carry explicit
  timestamps for the same reason.
- **Moving `InstancedMesh`es get culled.** three.js computes an instanced mesh's bounding
  sphere once and culls against it forever; if the instances move (Stern–Gerlach's atoms), set
  `frustumCulled = false` or the beam vanishes from most view angles.
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
  `await __game.setCamera("overview" | "ledge" | "window")`, `await __game.nextFrame()`.
  `setCamera` and `setPlayer` are async (they load the destination room first): await them. Camera
  poses live in each exhibit's `view.ts` (`CAMERA_POSES`).
- Vite `base` is `"./"` so the build works under the Pages subpath; keep asset URLs relative.
