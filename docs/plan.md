# Getting Started Plan

How we go from an empty repo to a first playable exhibit, then grow from there.
See [concept.md](concept.md) for the game vision.

## Guiding principle

**Prove the puzzle is fun before making it pretty or walkable.** Build the first exhibit as a
gray box with a fixed camera, get the observe → experiment → solve loop working, and only then
add first-person movement and the visual pass.

One caveat: a room that reads well from a fixed overview camera may not read well from inside
it. Place the fixed camera at roughly eye height near the entrance, and treat the first-person
milestone as a second playtest of the same puzzle.

## Tech stack

| Concern            | Choice                                   | Notes |
| ------------------ | ---------------------------------------- | ----- |
| Language / build   | TypeScript + Vite                        | Fast dev server, hot reload, simple static build. |
| Rendering          | `three`                                  | Three.js draws the scene. |
| Physics            | `@dimforge/rapier3d-compat`              | Rapier runs the simulation. The `-compat` build embeds the WASM, so there's no bundler config. |
| Input / camera     | `PointerLockControls` (three/addons)     | First-person look, added in Milestone 2. |
| Player movement    | Rapier `KinematicCharacterController`    | Replaces the octree collision from the three.js FPS example, so the player and the props live in one physics world. |
| Interaction        | `THREE.Raycaster`                        | From the mouse cursor while the camera is fixed (as in the "interactive cubes" example); from screen centre once pointer lock is in. |
| Debug UI           | `lil-gui` + `stats.js`                   | Tweak gravity and damping live while designing puzzles. |
| Tests              | `vitest`                                 | Rapier runs in Node, so rooms can be simulated headlessly. |
| Lint               | `oxlint`                                 | Native linter with its own TS parser. typescript-eslint doesn't support TypeScript 7 yet (peer range `<6.1`). |
| Browser automation | `playwright`                             | Drives the real build through a debug API and takes screenshots from fixed camera poses. |
| Hosting            | Static host (e.g. GitHub Pages)          | A shareable URL for playtesters from Milestone 0. |
| Assets (later)     | glTF via `GLTFLoader`                    | Gray boxes first; models replace them later. |

### Reference examples (official three.js gallery)

- **games_fps**: walking and colliding in a 3D environment (borrow the feel, not the collision code).
- **physics_rapier_basic**: Rapier set up alongside three.js; the starting point for the ball/ramp.
- **webgl_interactive_cubes**: raycast picking of the object under the cursor.
- **physics_rapier_joints**: the starting point for the broken pendulum exhibit.
- **webgl_lightprobe / Sponza**, **webgl_lights_spotlight**, **webgl_loader_gltf**: atmosphere and asset loading for the visual pass.

## Architecture sketch

Keep four ideas separate from day one so that rooms stay easy to add:

1. **Engine loop:** a fixed physics timestep (60 Hz) driven by an accumulator. Each rendered
   frame runs zero or more physics steps, then draws meshes interpolated between each body's
   previous and current transform (Rapier doesn't interpolate, so the sync layer stores both).
2. **One physics world per exhibit:** `world.gravity` is global to a Rapier world, so each
   exhibit owns its own world and only the active exhibit's world is stepped. The dark
   corridors between exhibits are the seam: the player's capsule is handed from one world to
   the next while in the corridor.
3. **Rules:** each room owns a list of `Rule` descriptors. A descriptor carries everything the
   instrument needs to display and edit a rule, and knows how to apply itself:
   ```ts
   interface Rule<T = unknown> {
     id: string;                    // "gravity", "pendulum.damping", ...
     label: string;                 // shown on the instrument
     kind: "choice" | "range";
     options?: { label: string; value: T }[];   // for "choice", e.g. down / toward east wall
     range?: { min: number; max: number; step: number };  // for "range"
     current: T;
     nominal: T;                    // the "correct" law; drives Restore and trade-offs
     editable: boolean;             // may the instrument change it in this room?
     apply(ctx: ExhibitContext): void;  // push `current` into the world / bodies / colliders
   }
   ```
   This handles rules of different scope (gravity is per-world, damping is per-body,
   restitution is per-collider) without a flat grab-bag object, and extends to optics or heat
   without touching the instrument. Puzzles become "which rules, in which order".
4. **Exhibits:** each room is a module with a common interface. *As built:* the sim side is
   `ExhibitBase` in `src/exhibits/Exhibit.ts` (adds `save()`/`load()` for the solver and
   `stepUntilSettled()`), and each exhibit's view is a separate function in its `view.ts`
   rather than a `buildView` method, which keeps three.js out of the sim entirely.
   ```ts
   interface Exhibit {
     buildSim(ctx: SimContext): void;   // bodies, colliders, joints, sensors; Rapier only
     buildView(ctx: ViewContext): void; // meshes and lights, bound to the sim's bodies
     rules: Rule[];
     budget: number;                    // how many changes are allowed
     update(dt: number): void;          // per-step logic (custom forces, sensors)
     isSolved(): boolean;
     isFailed(): boolean;               // e.g. ball out of bounds; triggers auto-reset
     reset(): void;                     // restore the initial snapshot
     describe(): ExhibitState;          // rule values, body positions, solved/failed, as plain data
     dispose(): void;
   }
   ```
   **Sim and view are split.** `buildSim`, `update`, `isSolved`, `isFailed`, `reset` and
   `describe` must not import three.js or touch the DOM, so an exhibit runs unchanged in Node.
   Everything in the development harness depends on this.

**Reset** uses `world.takeSnapshot()` right after `buildSim`, and `World.restoreSnapshot()` on
reset, then rebinds meshes to bodies by handle. Reset also restores every rule's `current` to
its starting value and refunds the budget; experimenting must be free.

**Game state:** a small object records, per exhibit, whether it's solved and the final value
of each rule. Later rooms read it for trade-offs ("you left gravity broken in gallery 1"), and
it's what save/load will serialise.

Proposed layout:

```
src/
  main.ts              # bootstrap, renderer, loop
  engine/
    loop.ts            # fixed-timestep accumulator
    physics.ts         # per-exhibit Rapier world, snapshots, interpolated body<->mesh sync
    input.ts           # keyboard / mouse / pointer lock
    interaction.ts     # raycast picking, "use" action
  rules/
    Rule.ts
    instrument.ts      # inspect / adjust UI and budget
  exhibits/
    Exhibit.ts
    sideways-gravity/  # first exhibit
    pendulum/          # second exhibit
  state/
    gameState.ts       # solved flags, final rule values
  ui/                  # HUD, instrument overlay
  debug/
    api.ts             # window.__game, URL parameters
    recorder.ts        # input log record / replay
harness/
  solver.ts            # enumerate action sequences, report metrics
  trajectory.ts        # top-down SVG of body paths
  screenshots.ts       # Playwright: fixed camera poses per exhibit
tests/
  exhibits/            # headless solvability and solver-threshold tests
  replays/             # recorded sessions kept as regression tests
public/
  assets/              # textures, glTF, audio
docs/
CLAUDE.md              # commands, conventions, gotchas
```

## Development harness

The harness is what lets Claude (or any contributor) check a change without a person looking
at the screen, and carry lessons from one session to the next. Human playtests stay the judge
of whether a room is fun; the harness covers everything that can be measured.

| Piece | What it checks | Arrives in |
| ----- | -------------- | ---------- |
| `npm run check` | One command: typecheck, lint, tests, solver report, physics step-time benchmark. Runs in CI and in a Claude Code Stop hook, so a session can't end with it red. | Milestone 0 |
| `CLAUDE.md` | Commands, the sim/view rule, and known gotchas (wake bodies on gravity change, no out-of-range engine parameters). Each new gotcha is added when it is found. | Milestone 0 |
| Headless exhibit tests | Replays the intended solution in Node and asserts `isSolved()`; replays known non-solutions and asserts they fail. | Milestone 1 |
| Puzzle solver | Enumerates every action sequence within the budget over a few timing buckets, and reports the metrics below. | Milestone 1 |
| `describe()` and trajectory SVG | A text dump of the room's state and a top-down plot of the ball's path, for debugging physics without a screenshot. | Milestone 1 |
| Debug API and screenshots | `window.__game` (`setRule`, `step(n)`, `getState`, `setCamera`) and URL parameters (`?exhibit=…&paused`). Playwright drives the real build and saves screenshots from fixed camera poses, which Claude inspects. | Milestone 1 |
| Record and replay | Inputs are logged against the fixed timestep and saved as JSON. A playtester's stuck or soft-locked session is replayed headlessly and kept as a regression test. | Milestone 1 (rule changes), Milestone 2 (player movement) |

**Solver metrics**, each with a threshold asserted in the exhibit's test:

- **Solvability:** the intended solution is among the sequences that solve the room.
- **Shortcuts:** no solution exists that is shorter than, or different in kind from, the
  intended one (for the first room, "just restore down" must fail).
- **Brute-force resistance:** the share of all sequences that solve the room is low.
- **Robustness:** the intended solution still works in at least 95% of runs when its timing
  and the bodies' start positions are jittered.

For `"range"` rules the solver samples a coarse grid rather than enumerating.

**What the harness can't check:** whether the puzzle is fun, and whether a newcomer understands
why their solution worked. The solver's numbers are proxies for "finicky" and "button-mashable";
the replay logs make each human session reusable.

## Milestones

### Milestone 0: Scaffold (½–1 day)
- `npm create vite@latest` (vanilla-ts), add `three`, `@types/three`,
  `@dimforge/rapier3d-compat`, `lil-gui`, `stats.js`, `vitest`.
- Renderer, camera, one light, a floor, an orbit camera for debugging.
- Rapier initialised, with a cube falling onto the floor and synced to its mesh through the
  accumulator loop with interpolation.
- Sim/view split in place from the first cube: the falling-cube scene is built by a Rapier-only
  function and a separate mesh-binding function.
- One headless test: step the world in Node and assert the cube comes to rest on the floor.
- `npm run check` (typecheck, lint, tests, step-time benchmark), run by CI and by a Claude Code
  Stop hook in `.claude/settings.json`.
- `CLAUDE.md` with the commands and the sim/view rule.
- Deploy the static build so there is a URL to send to playtesters.
- **Done when:** `npm run dev` shows a cube falling and landing, `npm run check` passes locally
  and in CI, and the deployed URL shows the same scene.

### Milestone 1: Gray-box "sideways gravity" exhibit, fixed camera (2–3 days)
The first puzzle. The room starts **broken**, in line with the concept:
1. Gravity in this gallery points toward the east wall. A heavy marble ball sits pinned
   against that wall; debris and a plumb line hang sideways.
2. The target is a pedestal in the floor. A brass panel selects the gravity direction.
3. Simply restoring downward gravity drops the ball to the floor in the wrong place, too heavy
   to move. The player has to reason about where the ball will travel: first send it along the
   wall onto a track, then restore "down" so it drops onto the target.
4. A wrong direction has a visible, explainable consequence, so pressing buttons at random
   doesn't solve it. *As built:* the dead end is the floor itself. There is no "up", so once
   the ball drops below the ledge it can never get back, and the room auto-resets.

Tasks:
- Build the room from boxes: floor, walls, track/ledge, dead-end pocket, target pedestal, door.
- **Gravity tell-tales** (gray-box versions): a plumb line on a joint, a few loose debris
  cubes, drifting dust particles. These are how the player observes the rule, so they belong
  here rather than in the visual pass.
- Ball as a dynamic rigid body with CCD enabled; walls at least as thick as the ball's radius,
  so a fast ball can't tunnel through.
- Target as a **sensor collider**. Solved means the ball has stayed inside the sensor below a
  speed threshold for about half a second, not merely touched it.
- Gravity as the first `Rule` (kind `"choice"`), applied via `world.gravity = {x, y, z}`.
  **Gotcha:** sleeping bodies don't react to a gravity change, so call `body.wakeUp()` on every
  dynamic body when gravity changes.
- Temporary control: lil-gui buttons or number keys for the gravity options.
- Reset key backed by the world snapshot; out-of-bounds detection (`isFailed`) auto-resets.
- Door opens (animate a kinematic body) when the room is solved.
- Headless test: replay the solution (set gravity, step N, set gravity, step N) and assert
  `isSolved()`; replay "just restore down" and assert it is not solved.
- Puzzle solver over the gravity options, with thresholds for the four solver metrics asserted
  in the test. Tune the room layout until they pass before asking a person to play.
- `describe()` and the trajectory SVG for the ball.
- Debug API and Playwright screenshots of the room from the fixed camera, before and after
  the solution.
- Record rule changes during playtests; add any stuck or soft-locked session to `tests/replays/`.
- **Done when:** the solver thresholds pass, and someone who hasn't seen the room solves it in
  a couple of minutes, can say *why* their solution worked, and didn't get there by cycling
  every option.

### Milestone 2: First-person movement (2–3 days)
Done before the instrument so that the instrument is designed once, for first person.
- `PointerLockControls` for look; WASD moves a capsule via Rapier's `KinematicCharacterController`
  (it only computes movement; we apply the player's own gravity and step-up ourselves).
- Raycast from screen centre and highlight the object under the crosshair (emissive tint).
  Click the brass panel to cycle gravity direction instead of using debug keys.
- **Design decision: is the player affected by room gravity?** *Decided (Nov 2026): no.* The
  player is **not** affected (the instrument "anchors" you), which keeps movement simple and the
  puzzle readable. Revisit later as a possible mechanic.
- **Design decision: how do the player and the ball interact?** A kinematic capsule is an
  immovable obstacle to the ball, so the player could block or trap it. *Decided: keep the
  player out of the ball's path by design.* As built, no rail is needed: every successful path
  keeps the ball at least 3.4 m up (ledge height or higher), far above the 1.7 m player; it only
  comes down to head height once the room has already failed. Tell-tales pass through the player.
- *As built:* a viewing hall south of the window where the player starts, a doorway in the
  glass, a gravity console just inside (five brass buttons laid out like the room), and an exit
  corridor behind the west door. Resetting while in or beyond the doorway moves the player back
  inside, since the door closes.
- Walk from an entrance corridor, through the exhibit, out the opened door.
- Extend the recorder to player movement and look, and the debug API to place the player, so
  Playwright can take first-person screenshots from set positions.
- Playtest again: confirm the puzzle still reads from inside the room, and adjust the layout
  or tell-tales if it doesn't.
- **Done when:** the full room is playable in first person without the debug camera or debug keys.

### Milestone 3: The instrument v0 (1–2 days)
Decide open questions 2 (budget model) and 3 (touch support) before starting; both dictate
the instrument's design.
- Instrument overlay (HTML/CSS on top of the canvas): lists the room's rules, their current
  and nominal values, which are editable, and the remaining budget.
- HTML can't be clicked while the pointer is locked. Recommendation: holding a key raises the
  instrument and releases pointer lock; releasing the key re-locks. (The alternative is a
  keyboard/wheel-driven instrument that never unlocks.)
- Changing a rule spends budget; reset refunds it.
- Reset room button on the instrument.
- **Done when:** the puzzle is solvable using only in-world interaction and the instrument,
  and a new player can tell from the instrument what is wrong with the room.

### Milestone 4: Visual pass on one room (3–5 days)
- PBR marble (floor/walls) and brass (panel, rails) using CC0 textures (e.g. ambientCG, Poly Haven).
- An HDR environment map for reflections; spotlights over exhibits; shadows on key objects only.
- Tone mapping (ACES/AgX), a subtle bloom on brass and emissive highlights.
- Dress the gravity tell-tales: floating dust and debris that sell "broken physics".
- Basic audio: footsteps, ball rolling, a gravity-shift sound.
- Keep an eye on performance: target 60 fps on a mid-range laptop.
- **Done when:** a screenshot of the room conveys the art direction.

### Milestone 5: Second exhibit, the broken pendulum (3–4 days)
- Pendulum built with a Rapier revolute or spherical joint (from the joints example).
- Broken rule: **negative damping**; the pendulum gains energy each swing and shakes the room
  (camera shake, rattling debris).
- Implement negative damping ourselves rather than passing a negative `linearDamping` to
  Rapier, which isn't a supported input and grows without bound. In the exhibit's `update`,
  apply a force along the bob's velocity each step, with a cap on total energy so the
  "shaking apart" is tunable and can't blow up the simulation.
- Puzzle options: restore damping, or use timed impulses / gravity changes to make it strike a
  sequence of targets before stabilising it.
- Second physics world, with the player handed over in the connecting corridor.
- Game-state object records exhibit 1's outcome; exhibit 2 can read it.
- Reuses `Rule`, the instrument, and the exhibit interface, which validates the architecture.
- Headless solvability test and solver thresholds, as for exhibit 1. Damping is a `"range"`
  rule and the puzzle is timing-sensitive, so this is the first real test of the solver's
  grid sampling and jitter.
- **Done when:** two rooms are connected by a corridor and playable back to back, and
  resetting one room doesn't disturb the other.

### Milestone 6: Combine rules and add trade-offs (3–4 days)
- A third room that needs both gravity direction and damping.
- Introduce a "restoring one law worsens another" decision, driven by rules' `nominal` values
  and the game state from earlier rooms.
- **Done when:** a playtester has to choose which law to restore first, and can explain the
  consequence of their choice.

### Milestone 7: Optics exhibit (estimate after Milestone 6)
A new subsystem, not a variation on rigid bodies, so it gets its own milestone.
- Light beam traced with raycasts and drawn as glowing lines; mirrors the player can rotate.
- Broken rule: a wrong refractive index, which reveals a hidden door.
- Checks that the `Rule` descriptor really does extend beyond mechanics.
- **Done when:** the room is solvable through the instrument with no optics-specific UI code.

## Later backlog

- Waves (resonance) and thermodynamics (reversed heat flow) exhibits.
- Save/load progress between rooms (serialise the game-state object).
- Hub gallery connecting exhibits; museum map.
- Hint system ("museum placards" that explain the real law).
- Replace gray boxes with modeled glTF rooms and props.

## Risks and how we'll handle them

| Risk | Mitigation |
| ---- | ---------- |
| Physics puzzles feel random or finicky | Design for robust outcomes (tracks, funnels, walls), settle-based solve detection, snapshot reset, headless solvability tests, tune in lil-gui. |
| Puzzles solvable by brute force | Wrong choices have visible consequences; the solver measures brute-force resistance; exit criteria ask testers to explain their solution. |
| Changes verified only by a person looking at the screen | The development harness: `npm run check`, solver thresholds, screenshots through the debug API, replayed sessions. |
| Rendering code leaks into the simulation and breaks headless runs | Sim/view split enforced from Milestone 0; the headless tests fail if an exhibit's sim imports three.js. |
| Puzzle reads from the fixed camera but not in first person | Eye-height fixed camera; second playtest in Milestone 2. |
| Player soft-locks a room (blocks the ball, ball escapes) | Rail keeps the player off the track; `isFailed` auto-resets; reset is always available and free. |
| Integrating the FPS controller with Rapier | Use Rapier's character controller from the start instead of porting the octree approach. |
| Unstable simulation from broken rules | Implement broken rules as explicit, capped forces rather than out-of-range engine parameters. |
| Visual ambition slows progress | Strict gray-box-first rule; the visual pass happens per room, after it's fun. |
| Performance with shadows and physics | Limit shadow-casting lights; sleep bodies; step only the active exhibit's world; profile early with stats.js. |

## Open questions

1. Does room gravity affect the player? (Recommendation: not in v1. Decide by Milestone 2.)
2. How is the instrument budget expressed: number of changes, an energy meter, or fixed "slots"?
   (Decide before Milestone 3.)
3. Target platform: desktop browser only, or also touch/mobile? Pointer lock and a hold-key
   instrument assume desktop. (Decide before Milestone 3.)
4. Is there a narrative layer (who broke the museum?), and how much text?

## Immediate next steps

1. Milestone 0 scaffold, including the sim/view split, `npm run check`, `CLAUDE.md` and a
   deployed URL.
2. Gray-box the sideways-gravity room with tell-tales, debug-key gravity control, and reset.
3. Run the solver and tune the layout until its thresholds pass.
4. Playtest it before writing any movement or instrument code.
