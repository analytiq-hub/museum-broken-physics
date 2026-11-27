# Getting Started Plan

How we go from an empty repo to a first playable exhibit, then grow from there.
See [concept.md](concept.md) for the game vision.

## Where things stand (27 Nov 2026)

- **Live:** https://analytiqhub.com/museum-broken-physics/, deployed from `main` after CI.
- **Thirteen galleries on three floors, visited in a fixed order:**
  - **Floor 1, mechanics:** I the Sideways Gallery (gravity), II the Restless Pendulum
    (damping), III the Bouncing Hall (restitution), IV the Leaning Pendulum (gravity and
    damping, the finale).
  - **The Grand Stair** climbs 4.8 m.
  - **Floor 2, waves, light and heat:** V the Hidden Door (refractive index), VI the Singing
    Glass (speed of sound), VII the Chladni Plates (sound in brass), VIII the Backwards Furnace
    (heat flow), IX Young's Double Slit (wavelength and index, the finale).
  - **The Upper Stair** climbs to Floor 3.
  - **Floor 3, modern physics** (in progress): X Rutherford's Gold Foil (the atom's charge),
    XI Stern–Gerlach (spin), XII the Quantum Tunnel (Planck's constant), XIII Slow Light (the
    speed of light).
  - The closing placard is a small room (`the-end`) after the last gallery.
- **Done:** Milestones 0–12, Floor 3's first three rooms (Milestone 13, in progress), plus work
  added after the plan:
  - touch controls;
  - pause on Esc;
  - saved progress with a visitor's ticket;
  - an instrument that doesn't reveal a law until the player has discovered it;
  - galleries streamed three at a time;
  - the museum laid out as floors (see "Museum layout").
- **Next:** the rest of Floor 3 (Milestone 13) and a real playtest (see "Immediate next steps").

## Museum layout (decided Nov 2026)

**One route, in floors.** Players get no choices. They go through a fixed sequence, and every
door opens only when its room is solved. The sequence is split into floors, and each floor is
a level: clearly separate, and harder than the one below.

- **What separates the levels:**
  - a stairwell between floors, so the change of level is physical;
  - a farewell placard at the foot ("Floor 1 complete") and a welcome placard at the top that
    names the next floor and what's new;
  - a different look per floor (Floor 1 marble floors, Floor 2 wood);
  - the HUD shows the floor ("Floor 2 · Waves and Light · Gallery V");
  - the visitor's ticket has a row of stamps per floor.
- **Floors have as many rooms as their theme needs** (Floor 2 has five), not a fixed count.
- **The shape of a floor:** the first room teaches the floor's new idea with one obvious law,
  the middle rooms vary it, and the last room combines them (Floor 1 ends with the Leaning
  Pendulum, gravity plus damping). That last room is the gate up.
- **Floors and their rooms:**

  | Floor | Theme | Rooms (built, then planned) | What makes it harder |
  | ----- | ----- | --------------------------- | -------------------- |
  | 1 | Mechanics | Sideways Gallery, Restless Pendulum, Bouncing Hall, Leaning Pendulum (finale); later perhaps the Little Solar System before the finale | One law per room, visible effects, generous budgets |
  | 2 | Waves, light and heat | V Hidden Door, VI Singing Glass, VII Chladni Plates, VIII Backwards Furnace, IX Young's Double Slit (finale); all built | Invisible quantities (index, frequency, temperature), decoys, tighter timing |
  | 3 | Modern physics | X Rutherford's Gold Foil, XI Stern–Gerlach, XII the Quantum Tunnel, XIII Slow Light (built); XIV Einstein's Elevator, XV a quantum finale (planned, Milestone 13) | Laws that defy intuition, measurement changes outcomes, sometimes two laws per room |

- **How it is built:** rooms keep the coordinates they were built in, and `OFFSETS` in
  `src/galleries/rooms.ts` places them in the museum. Every corridor is a standard 8 m stub
  that each room builds itself (`corridor()` in `layout.ts`). Floor 2 continues west, 4.8 m
  up, rather than sitting directly above Floor 1. Players never see the outside, so the climb
  and the change of look are what separate the floors.
- **Adding a room:** add its gallery module, list it in `ROOMS` at its place in the route with
  its door positions, and the offsets of every room after it follow. The room-list test checks
  that every pair of neighbouring corridors meets exactly.

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
the instrument's design. *Decided (Nov 2026): a count of changes, desktop only.*
*As built:* holding Q raises the instrument; the pointer stays locked and the mouse drives a
cursor on it (the view freezes), which avoids re-locking entirely. It shows each law's reading
vs. the law, a Broken / As it should be status, a one-line explanation, the options (gravity as
the room-shaped pad), Restore, changes left and Reset. The in-world console stays; both share
the budget. `npm run ui-check` tests the whole flow with a real pointer lock in CI.
*Changed (Nov 2026):* the instrument no longer gives the answer away. Until the player has
discovered a law (by solving a room where it could be changed), it shows only the reading and
what it does here (each rule's `observe()`). No law, no Broken/OK chip, no highlighted option,
no Restore. Discovered laws show everywhere afterwards, with where they were learned.
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
- *As built:* Poly Haven CC0 marble tiles (floor), veined marble (walls, ledge, chips),
  plaster (ceiling) and the "Museum of Ethnography" HDRI for reflections; procedural brass,
  walnut, placard and console engraving. Dark marble baseboards, cornice and door surround;
  brass window frames and a cracked pane; a laylight with brass glazing bars (decorative,
  deliberately dim). Lighting: a corner key spot (the only shadow map), a target spot with a
  faint light shaft, side wall-washes and sconces; nothing bright overhead, because it glared
  off the console (found in playtesting). Bloom, ACES tone mapping, soft additive dust.
  Synthesized sound (footsteps, rolling, impacts, gravity sweep, clicks, chime, door, fail,
  room tone). Real-GPU frame rate not yet measured: the frame is ~115 draw calls / 11k
  triangles, and `?quality=low` exists for slow machines.

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
- *As built (option b, chosen Nov 2026):* bells at 40° and −65°, a glass vase at 80°, the room
  "shakes apart" past 85°; solved = both bells rung, then at rest (< 8° for 2 s). From the
  start the low bell rings at ~7 s, the high one at ~23 s, the vase breaks at ~31 s. Damping
  is a range rule with five named marks (strong push … heavy drag); the room has no console,
  so it teaches the instrument. The solver found a second strategy (strong push first, then
  drag) and showed that a fixed-time robustness check was the wrong model of a player.
  `npm run ui-check` walks between the galleries and checks that resetting one leaves the
  other alone.

### Milestone 6: Combine rules and add trade-offs (3–4 days)
*As built (Nov 2026): Gallery III, the Leaning Pendulum.* Gravity leans toward the right
wall and damping is negative. The bell sits above the pivot, reachable only while gravity is
broken. The pendulum tears loose (its joint is removed) if it swings more than 65° from where
gravity says it should hang, so putting gravity straight back drops it 90° and fails: the
player must ring the bell, calm the swing with drag, then bring gravity home in stages via
"floor, leaning right". The solver changes both rules; 6 of 1049 sequences solve it (0.6%),
all of that shape. Gallery II gained a west door that opens when solved. Not yet done: later
rooms reading the game state from earlier ones.
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
- *As built (Nov 2026): Gallery IV, the Hidden Door.* A lamp, two mirrors on stands, a glass
  prism; the broken index (0.7) bends light the wrong way, and the misbent beam lands on the
  west wall, revealing a hidden door's outline beside its photocell. Put the index right
  (1.5) and turn the mirrors (free control rules, clicked in the world) to light the
  photocell; the door opens onto corridor 4–5 (at first, an alcove). The layout was found
  by searching prism and mirror positions so that, of all 720 index × mirror arrangements,
  only the glass index works (one mirror setting). The instrument needed no optics code: the
  index is a range rule with marks; mirrors are `control` rules (not listed, no budget).

### Milestone 7b: Gallery V, the Bouncing Hall (done, Nov 2026)
Added after the plan, on the player's request. **Broken law: bounciness** (restitution 1.07,
law 0.6). Pull a lever and the ball drops from a claw onto an anvil. Each bounce is higher,
until a slanted brass deflector throws it onto a felt balcony. Restore the bounce there and
it comes to rest; too early and it dies on the anvil, too late and it smashes the skylight.
Restitution above 1 is an explicit, capped boost. The felt soaks up sideways speed, so the
window is several seconds after the ball lands at any drop height (tested). The lever is a
`control` rule. The closing alcove sits behind its exit door.

**Order from here (agreed Nov 2026):** Gallery VI, the Singing Glass (Milestone 8), then
streaming (Milestone 9), then the rest of Floor 2 (Milestones 10–12; see "Museum layout").

### Milestone 8: Gallery VI, the Singing Glass (waves; 4–5 days)
*Done (Nov 2026).* Built as below, with two changes: the pane is the west doorway rather
than the left wall, so the museum stays one line of rooms; and the organ stands against the
north wall. Headless tests replace the solver report: of every speed mark × pipe held for
20 s, only air with the third pipe opens the way.

The second subsystem that isn't rigid bodies. It teaches one new law, resonance, and
the player can **hear** that law being wrong.

- **Room.** The Bouncing Hall's exit door leads into a narrow hall. On the far wall is a small
  organ with five open pipes of different lengths. Glass stands on shelves along both side walls:
  - the exit is a tall **glass pane** in the left wall (the door to Gallery VII);
  - an antique **glass harmonica** sits in a case on the right wall; shattering it fails the
    room;
  - two or three decoy glasses only ring and wobble.
- **Broken law: the speed of sound.** It is 229 m/s instead of 343. An open pipe sounds at
  v / 2L, so every pipe plays flat, by about a fifth. The glasses' own frequencies don't depend
  on v, so retuning v retunes the organ and nothing else. It is a range rule with marks:
  "Too slow (229)", "Carbon dioxide (259)", "Air (343)", "Helium (972)".
- **Controls.** Clicking a pipe sounds it until it's clicked again: a `control` rule
  "sounding pipe" (none, 1–5), which costs nothing from the budget, like the mirrors in Gallery IV.
- **Sim** (`src/exhibits/singing-glass/resonance.ts`, pure maths like `trace.ts`). Real
  frequencies of hundreds of hertz can't be integrated at 60 Hz. Instead, each glass tracks
  the *envelope* of its vibration:
  `dA/dt = −A/τ + k · L(f_drive, f₀, Q)`, where L is the Lorentzian response.
  This is a closed form, deterministic and cheap. A glass shatters at A ≥ 1 and shows a
  crack at 0.5. When the pipe stops, the amplitude decays, so experimenting is safe for a
  player who reacts to the crack. The Rapier world holds only the room.
- **Tuning** (the solver tunes it, as in earlier rooms):
  - At 229 m/s, no pipe matches the pane, and one pipe sits close to the harmonica: the
    obvious "play every pipe" experiment cracks it.
  - At air, exactly one pipe matches the pane, and the pane (high Q, thick glass) needs about
    8 s of sustained tone.
  - Helium and CO₂ each put a different pipe onto the harmonica or a decoy. That way the
    marks are wrong in ways the player can see, not just ineffective.
- **Hypothesis loop.** The placard (`explain`) says "an open pipe sounds at v / 2L; sound
  should travel at 343 m/s here, it travels at 229". The player hears the pitch slide live
  if they change v while a pipe is sounding.
- **View and sound.** Synthesise the pipes' real pitch in `sound.ts`. Each glass rings at its
  own pitch with gain ∝ A and wobbles visibly with A, and a crack decal appears at 0.5.
  Shards are decorative debris in their own collision group (see Gotchas).
- **Harness.**
  - Headless test: the intended solution (restore air, sustain the matching pipe) solves.
  - Headless test: sounding every pipe at 229 m/s fails or does nothing.
  - Solver thresholds in `harness/solverConfigs.ts`. The moves are "sound pipe *p* for *t*
    seconds", sampled over a time grid.
  - A screenshot of the cracked harmonica.
- **Layout.** Corridor 5–6 replaces the closing alcove behind the Bouncing Hall's exit door
  (already the standard z 1..3), and the closing placard moves to the Singing Glass.
- **Done when:**
  - a playtester explains which pipe broke the pane *and why that pipe*, not just that it
    worked;
  - the room needs no waves-specific instrument UI.

### Milestone 9: Stream galleries instead of building them all (3–4 days)
*Done (Nov 2026).* As built:
- `src/galleries/rooms.ts` lists the rooms as data: id, title, the laws each one teaches, its
  camera names, and a `load()` that imports the gallery's own chunk.
- `main.ts` keeps the active room and its neighbours built. A handover loads the room beyond
  and frees the one two rooms back with `disposeGroup` (shared materials stay), and frees the
  physics world too.
- A room built after it was solved comes back solved (`restoreSolved()`), the same path saved
  progress uses.
- Shaders compile with `compileAsync` before a room is shown.
- `__game.setPlayer` and `setCamera` are async and load the destination first;
  `__game.getLoaded()` lists what is built.

Changes from the plan below:
- **No door is held shut.** If the player reaches a corridor's midpoint before the next room
  is ready, they are held at the line. That's rare: the room is requested as soon as the
  player enters the room before it.
- **Budgets run after every build** (`npm run build`, so in CI), not in `npm run check`,
  which doesn't build. The plan's "4 MB first load including shared assets" couldn't hold with
  6 MB of already-compressed textures, so code and assets have separate budgets:
  - first-load JS + CSS: 2.3 MB gzipped (1.8 MB today);
  - each room: 150 KB gzipped (1–6 KB today);
  - `public/assets`: 8 MB (6 MB today).
- **Not done yet:**
  - KTX2 textures (no room has its own textures yet);
  - Rapier's separate-`.wasm` build;
  - measuring memory on a real GPU.

The ui-check asserts which rooms are built where, and that a solved room survives being
freed and rebuilt.

The museum should be able to grow to about 50 rooms without a longer load or more memory.
Do this before the gallery after VI. The later it waits, the more galleries assume they
always exist.

- **Where the cost is today (Nov 2026, four galleries; five since).**
  - The download is about 4.85 MB of JS, almost all of it Rapier's inlined WASM, plus about
    6 MB of shared textures and HDRI. All gallery and exhibit code is about 129 KB raw, roughly
    32 KB per room. Fifty rooms of code would be about 1.6 MB raw, around 400 KB gzipped, so
    the download is not what breaks.
  - Drawing is already limited: `updateGalleryLights` lights only galleries within 10 m and
    draws only those within 22 m.
  - What does grow with room count: `main.ts` builds **every** gallery at startup, so every
    gallery has a Rapier world, meshes, compiled shaders and sounds in memory, and all of that
    is built before the first frame. `sync.render` also runs for every gallery each frame.
- **Room list.** Replace the hard-coded `galleries` array with a list of rooms: id, x-range,
  west and east neighbours, and a loader `() => import("./galleries/<name>")`. Vite then gives
  each gallery its own chunk. The corridor layout in `layout.ts` stays the single source of
  where rooms are.
- **Keep three rooms live:** the active gallery and its two neighbours. When the player is
  handed over at `HANDOVER_X`, start loading the room after next and unload the one two
  rooms back. Loading starts as the player enters a corridor, so a room is ready well before
  its door. If a room isn't ready, its door stays shut, so it never appears in front of the
  player.
- **Unloading.** Add `dispose()` to `Gallery`: `world.free()`, remove `group` from the
  scene, dispose geometries and room-only materials and textures, and stop sounds.
  Shared materials from `loadMaterials` stay loaded. Corridor geometry is drawn by the
  eastern gallery (see the `skip` lists), so it must be on screen whenever either room on
  its two sides is live.
- **State.** A room that is unloaded and loaded again is rebuilt fresh. That is the same as
  reset, which closes doors, so `RESET_SPOT` rules apply. Solved status stays in `GameState`.
  A solved room shows its solved state again when it is rebuilt: open door, restored law.
  The recorder starts a new attempt on arrival, as now.
- **Assets per room.** A gallery that needs its own textures or models lists them and loads
  them with its chunk. Use KTX2/Basis for new textures, which are smaller to download and
  much smaller on the GPU than JPEG. Shared materials stay in the initial load.
- **Rapier.** Consider switching from `@dimforge/rapier3d-compat` to the build that loads a
  separate `.wasm`. Browsers then compile it while it downloads and cache it apart from game
  code, so shipping a new room doesn't make players download the physics engine again.
- **Debug API and harness.** `__game.setCamera`, the `cameras` list and the screenshot
  harness assume every gallery exists. Jumping to a room's camera loads that room and its
  neighbours first and awaits them. Headless tests, the solver and replays are sim-only and
  build one exhibit at a time, so they are unaffected.
- **Budgets, enforced in `npm run check`:**
  - initial load (core, Rapier, shared assets, first two rooms): about 4 MB gzipped, about
    what it is now;
  - each room chunk: under 150 KB gzipped, not counting its own listed assets;
  - live at once: three physics worlds, at most about 300 draw calls at any point on the
    route.
  A small script reads Vite's build manifest and fails over budget.
- **Harness.**
  - A ui-check or screenshot run walks Gallery I → IV and asserts that at most three
    galleries are loaded at any time and that no door opens onto a room that isn't loaded.
  - Leaving a room and coming back shows the same solved or unsolved state.
  - Existing replay fixtures still pass unchanged.
- **Done when:**
  - adding a gallery doesn't change the first-load size or the time to the first frame;
  - memory stays flat after walking through every gallery and back;
  - nothing visibly appears from nowhere in first person.

### Milestone 10: Gallery VIII, the Backwards Furnace (thermodynamics + optics; 4–5 days)
*Done (Nov 2026).* As designed, with one change: objects exchange heat with the room as a
fixed reservoir, not through a shared air node (under the broken law the air itself ran away
to −60 °C and dragged every object into a runaway). Frost follows the stove's runaway instead.
The "insulated" option was left out: it made the room solvable without the broken law.
*Placement:* Floor 2, between the Chladni Plates and the Double Slit. It is built first
because it is designed in full. Until the Chladni Plates exist, it sits right after the
Singing Glass; inserting a room later is one entry in `ROOMS`, and the offsets of the rooms
after it follow. Its corridor replaces the closing alcove behind the Singing Glass's pane, and
the closing placard moves to whichever room ends Floor 2 at the time.
This room teaches heat flowing backwards and combines it with optics from Gallery IV. It also
delivers Milestone 6's unfinished trade-off: the broken law is the tool, and restoring it
too early or too late both lose.

- **Room.** A cold, abandoned boiler room at −8 °C:
  - the exit door is latched by an **ice plug** in a brass frame;
  - a lamp and one clickable mirror (the Gallery IV tracer, moved to `src/optics/`) can aim a
    beam at the ice, at a cold iron stove, or at a wax-sealed display case.
- **Broken law: heat flows from cold to hot.** It is a choice rule: "hot → cold" (the law) /
  "cold → hot". It could also have "insulated"; the solver decides whether that third option
  makes the room too easy.
- **What the player sees on entering.** Under the reversed law, the warmest thing gets warmer.
  The unlit stove slowly glows red, and frost creeps over the ice and the walls. These are the
  tell-tales, like the plumb bobs in Gallery I.
- **Sim** (`src/exhibits/furnace/heat.ts`, pure maths). It is a lumped thermal network: nodes
  for ice, stove, wax and room air, each with a heat capacity, joined by links with a conductance.
  - Each step: `dT_i = s · Σ k_ij (T_j − T_i) / C_i · dt`, where s = +1 under the law and −1
    when broken, plus the beam's power on whichever node it hits.
  - The ice node also has latent heat to absorb before it melts.
  - The broken law is explicit and capped, per the Gotchas: temperatures are clamped
    (−60…400 °C), so the runaway can't blow up.
- **Puzzle.**
  - Under the law, the beam warms the ice only to about −3 °C, because the cold room drains
    the heat away. So it never melts, and "just restore" fails.
  - Under the reversed law, a beam-warmed ice plug becomes a warm spot and pulls heat in from
    the room. It runs away, melts, and the latch drops.
  - Left reversed, the meltwater keeps heating, flashes to steam at 100 °C and bursts the frame,
    which jams the door (fail, auto-reset).
  - Intended solution: aim the mirror at the ice, wait for the melt, restore the law before
    it boils.
  - Wrong but tempting: aim at the stove ("heat the stove to melt the ice") or at the wax
    case. Both run away somewhere useless, and the wax seal melting is a second fail.
- **Waiting costs.** Under the broken law the ice gets colder the longer the player waits
  without aiming the beam, so the melt takes longer. The window between the melt and boiling
  is a few seconds that the player watches happen, not a frame-perfect timing. As in Gallery
  II, the solver's robustness check models a player who reacts to an event (the latch
  dropping, with a hiss), not to a clock.
- **Cross-gallery state** (the other half of Milestone 6). If Gallery VI was solved with
  helium rather than air, the stove's flue whistles high. That is a cosmetic first use of
  `GameState`. A mechanical dependency is an open question below.
- **Harness.**
  - Headless tests: intended solution solves; just-restore fails; aiming at the stove fails.
  - Solver thresholds: mirror angle × heat-law changes × timing grid.
  - Trajectory SVGs become temperature-over-time plots for each node in `harness/out/`.
- **Done when:**
  - a playtester can say why they had to leave heat flowing backwards for a while;
  - every solver threshold passes;
  - the instrument needs no heat-specific UI.

### Milestone 11: Gallery VII, the Chladni Plates (sound you can see; 3–4 days)
*Done (Nov 2026).* The broken speed is 2380 m/s (0.68 of brass), chosen so each note lands
*exactly* on another figure: the shift is visible, not a blur. The sand needed a gentle slide
down the vibration's slope as well as random kicks to form a figure in about a second.
It follows the Singing Glass and turns sound into a picture.
- **The room:** a brass plate on a stand, sprinkled with sand, driven by a brass oscillator
  with a dial of notes (a free `control`, like the organ pipes). The exit door's lock is
  the plate itself: the door opens when the sand draws the keyhole figure engraved on it.
- **Broken law:** the speed of sound in brass, so every note draws the wrong figure. A mode's
  frequency scales with the wave speed in the plate. At the broken speed, the note marked
  "keyhole" draws a different figure, and the keyhole figure appears at a note no dial offers.
- **The puzzle:** read which figure each note draws, work out that every figure has shifted by
  the same ratio, and restore the speed. The keyhole note then draws the keyhole. Decoy
  figures (a star, a cross) are near-misses that don't open the lock. Driving the plate at
  resonance too long cracks it (fail, auto-reset), as in the Singing Glass, so a player who
  reacts to the crack is safe.
- **Sim:** pure maths, a plate's modes (products of cosines, frequency ∝ n² + m²) mixed
  through a resonance curve, like `resonance.ts`. Solved = the keyhole mode dominates for
  three seconds; it is decided from the mode weights, not from sand grains. The sand is the
  view's job: grains random-walk with step ∝ local amplitude and settle on the nodal lines.
  The art piece *Detuned Resonance* is a working prototype of this view.
- **Harness:** headless tests (solution, each decoy, the crack), brute force over speed marks ×
  notes, and screenshots of each figure.

### Milestone 12: Gallery IX, Young's Double Slit (Floor 2's finale; 4–5 days)
*Done (Nov 2026).* Marks: violet 420, green 560, sodium yellow 589 (law), deep red 770
(broken) nm; backwards 0.75 (broken), air 1.0, water 1.33 (law). The sensor sits six bands
out; a search over marks and sensor positions found this set, where every wrong combination
stays under half bright.
It combines two of the floor's laws, the way the Leaning Pendulum ends Floor 1.
- **The room:** a lamp, a plate with two slits, a glass water tank between the slits and the
  screen, and a screen with a brass light sensor that unlocks the stairs to Floor 3.
- **Broken laws:**
  - the light's wavelength (its colour is wrong);
  - the tank's refractive index, which the player has met in the Hidden Door, so its law is
    already known.
  Fringe spacing is λL / (n d). Neither law alone puts a bright band on the sensor.
- **The puzzle:** restoring the wavelength alone moves the bands but leaves a dark band on the
  sensor; restoring the index alone does too. Both are needed, in an order the budget allows.
  A free "observer" lamp switches on a detector at the slits and wipes out the pattern: the
  quantum hint that Floor 3 picks up.
- **Sim:** closed-form two-slit intensity (pure maths, like `trace.ts`). The screen shows the
  real pattern as a texture.
- **Harness:** headless tests (the solution, each law alone, the observer), brute force over
  both laws' marks, screenshots of the pattern before and after.

### Milestone 13: Floor 3, modern physics (in progress)
Floor 3 opens with the Upper Stair. Its rooms move from things that are odd to things that defy
intuition even when working: the atom, spin, tunnelling, then light and time.

- **Gallery X, Rutherford's Gold Foil (done).** Broken law: the atom's charge is spread
  through it (plum pudding), so alpha particles pass almost straight. Restored, a nucleus
  flings near particles away; their phosphor tracks show which way to slide the source (a
  free control, nine positions); dead-on, three particles bounce straight back and open the
  door. Decoy: a negative nucleus swallows them. Real 2D Coulomb scattering.
- **Gallery XI, Stern–Gerlach (done).** Broken law: spin can point any way, so the beam smears;
  the detectors starve and the glass cell between them slowly overheats (fail in ~13 s).
  Restored, two values: two clean spots. Decoy: three values crack the cell in ~3 s.
- **Gallery XII, the Quantum Tunnel (done).** Broken law: Planck's constant is enormous, so a
  marble leaks through glass as a wave (well → cup → drain). Restoring the law measures it:
  it collapses where its probability is largest. A 7 s window to land it in the cup.
- **Gallery XIII, Slow Light (done).** Broken law: light travels at 4 m/s, so a flash visibly
  crawls down a bench (a brass ruler marks the metres). The lock is a coincidence counter: one
  flash must light cell A, a metre from the lamp, and cell B, eight metres off behind a
  clockwork shutter, at the same instant. Slow light lights them 1.75 s apart (the lock's
  display says so); a flash that reaches the shutter while it is shut scorches it, and the
  second scorch jams it (fail). Restored, a flash is everywhere at once: fire it while the dial
  shows the shutter open. Decoy: 2 m/s. Pure maths (pulse fronts advanced each step).
- **Gallery XIV, Einstein's Elevator (planned).** Broken law: inertial and gravitational mass
  differ, so a heavy ball and a light one fall differently in a lift; the player must make two
  balls land on two plates at once. Rapier, with per-body gravity scales.
- **Gallery XV, Floor 3's finale (planned).** Combines two of the floor's laws, for example
  spin and Planck's constant: a beam split by spin, one half tunnelling.

## Later backlog

- Exhibits after Gallery VII: candidates based on famous experiments, and the best fits for
  the engine, are in [room-ideas.md](room-ideas.md).
- The Little Solar System: gravity falls off with the cube of distance, so orbits spiral;
  use the bad orbits to deliver a moon to a cradle, then restore the law.
- Exhibits after Gallery VII. Reversed heat flow could also freeze something on purpose, a
  room about the opposite runaway.
- ~~Save/load progress between rooms.~~ *Done (Nov 2026):* saved in the browser, with a
  visitor's ticket and Continue / New visit.
- Hub gallery connecting exhibits; museum map.
- Hint system ("museum placards" that explain the real law). More needed now that the
  instrument hides undiscovered laws: a stuck player has no other way to learn one.
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
| Load time and memory grow with every gallery added | Milestone 9 (done): each gallery is its own chunk, only three galleries are live at once, and every build enforces size budgets. |

## Open questions

1. ~~Does room gravity affect the player?~~ *Decided (Milestone 2): no.* The player has their
   own gravity.
2. ~~How is the instrument budget expressed?~~ *Decided: a count of changes.* Revisit an energy
   meter once rooms have "range" rules (damping, Milestone 5).
3. ~~Target platform?~~ *Decided: desktop browser only for now.* Revisit touch after the visual pass.
   *Revisited (Nov 2026): touch is supported* (joystick, drag to look, tap to use, Laws/Reset
   buttons), after a player couldn't play on a phone.
4. Is there a narrative layer (who broke the museum?), and how much text?
5. ~~How does the museum grow past one corridor of rooms?~~ *Decided (Nov 2026): one fixed
   route in floors, each floor a harder level, joined by stairwells.* See "Museum layout".

## Immediate next steps

1. **Playtest all three floors** with someone new. The instrument hides undiscovered laws, so
   the rooms must teach themselves; record with Shift+D, and a stuck session becomes a replay
   test.
2. **Milestone 13:** Einstein's Elevator and Floor 3's finale.
3. Optionally, Rapier's separate-`.wasm` build, so a new room doesn't make returning players
   download the physics engine again.
