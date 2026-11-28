# The Museum of Broken Physics: Project Summary

**Live build:** https://analytiqhub.com/museum-broken-physics/ (deployed from `main` after CI passes)
**Repository:** https://github.com/analytiq-hub/museum-broken-physics

## What it is

A first-person puzzle game in the browser. You walk through an abandoned museum whose
exhibits have broken physical laws. A physics instrument (hold Q) shows each room's laws
and what they read here, and lets you change a limited number of them. It never says what a
law should be until you have discovered it by putting a room right.
Each room is solved by forming a hypothesis, changing a law, and watching the room respond.
Often you have to *use* the broken law before you put it right.

Built with TypeScript, Vite, three.js (rendering) and Rapier (physics, WASM). Plays on desktop and on phones and tablets.

## The galleries, on three floors

| # | Floor | Gallery | Broken law | What the player does |
| - | ----- | ------- | ---------- | -------------------- |
| I | 1 | The Sideways Gallery | Gravity points at a wall | Use gravity changes to carry a marble along the walls onto a high ledge, then restore "down" to drop it onto a brass plate. Dropping it to the floor early is a dead end. Controlled from an in-world console or the instrument. |
| II | 1 | The Restless Pendulum | Negative damping: every swing gains energy | Let the swing grow until both bells ring, then apply drag before the bob smashes a glass vase or the room shakes apart. Instrument only. |
| III | 1 | The Bouncing Hall | Bounces gain energy (restitution 1.07) | Drop the ball and let each bounce climb until a brass deflector throws it onto a high balcony, then restore the bounce before it hops back off and smashes the skylight. |
| IV | 1 | The Leaning Pendulum | Gravity leans sideways *and* damping is negative | Ring a bell that is only reachable with broken gravity, calm the swing, then bring gravity home in stages (via 45°). Restoring gravity in one go tears the pendulum off its hook. This is the trade-off room. |
| | | **The Grand Stair** | | A passage up to Floor 2, with the Floor 1 farewell and Floor 2 welcome placards. |
| V | 2 | The Hidden Door | A prism's refractive index is wrong (0.7) | The misbent beam reveals a hidden door. Restore the index and turn two mirrors so the beam hits the door's photocell. |
| VI | 2 | The Singing Glass | The speed of sound is 229 m/s, so every organ pipe plays flat | Find the one pipe that, in air, sings the glass pane in the doorway to pieces, without shattering the antique glass harmonica. |
| VII | 2 | The Chladni Plates | Sound in brass travels at 2380 m/s, not 3500 | Each key draws the wrong sand figure, all shifted by one ratio. Restore the speed and the third key draws the figure engraved on the lock. |
| VIII | 2 | The Backwards Furnace | Heat flows from cold to hot | Aim a mirror's beam at the ice latching the door; it runs away and melts. Restore the law before the water boils. |
| IX | 2 | Young's Double Slit (finale) | The light's wavelength *and* the tank's refractive index | Only both laws put a bright band on the sensor. An observer lamp wipes the bands out. |
| | | **The Upper Stair** | | Up to Floor 3. |
| X | 3 | Rutherford's Gold Foil | The atom's charge is spread out, not in a nucleus | Restore the nucleus, read the alpha tracks, slide the source until particles bounce straight back. |
| XI | 3 | Stern–Gerlach | Spin isn't quantised: along the field it can take any value | The beam smears and slowly cracks a glass cell; with two spin values it splits cleanly onto the detectors. |
| XII | 3 | The Quantum Tunnel | Planck's constant is enormous | A marble leaks through glass as a wave; measure it (restore the law) when it's most likely on the ring. |
| XIII | 3 | Slow Light | Light travels at 4 m/s | A coincidence lock wants one flash at two cells at once; slow light reaches them 1.75 s apart. Restore it and fire while the shutter is open. |
| XIV | 3 | Galileo's Ledge | Gravity pulls cork half as hard as brass | Kick both balls off a ledge under the broken law so cork flies into the far pan; then restore it so the balance hangs level. |
| XV | 3 | The Silver Vault | Spin and Planck's constant | Floor 3's finale: restore spin so silver lands on the glass, let it tunnel into the vault, then restore Planck's constant while the vault holds the most. |

The galleries are joined by corridors. Each opens the next when solved, and the walk ends in
an alcove with a closing placard.

## How it is built

- **Simulation and rendering are kept apart.** Each exhibit's simulation (`src/exhibits/*/sim.ts`)
  is plain Rapier with no three.js and no DOM, so it runs headlessly in Node for tests, the
  solver and replays. Views (`view.ts`) only read it.
- **Laws are data.** Each `Rule` carries its current value, the correct value (the law),
  options or named settings, and a plain-language explanation. The instrument renders any
  rule, so it needed no gallery-specific code, including for optics. Rules marked "control"
  (mirror angles) don't cost budget and are operated in the world.
- **One physics world per gallery.** Corridors exist in both neighbouring worlds, and the
  player is handed over at the corridor midpoint. Only the active world steps, and R resets
  only the current room.
- **Fixed 60 Hz timestep** with render interpolation, so physics is deterministic.
- **Player:** a kinematic capsule on Rapier's character controller with its own gravity,
  which room gravity doesn't affect.
- **Visuals:** CC0 marble, plaster and HDRI from Poly Haven, procedural brass and wood, bloom,
  ACES tone mapping, and one shadow-casting light per room. Only nearby galleries are lit and
  drawn.
- **Sound:** synthesized with WebAudio, with no audio files.

## How it was completed

The project followed `docs/plan.md`, milestone by milestone. Each milestone was committed
and pushed, deployed through CI, and checked before moving on.

| Milestone | Outcome |
| --------- | ------- |
| 0. Scaffold | Vite + TS + three + Rapier, headless physics test, `npm run check`, CI, a Claude Code Stop hook that blocks ending a session while the check fails, GitHub Pages deploy, `CLAUDE.md`. |
| 1. First puzzle (gray box) | Sideways-gravity room, gravity tell-tales (plumb line, debris, dust), puzzle solver with thresholds, trajectory SVGs, debug API, Playwright screenshots, record and replay. |
| 2. First person | Walking, mouse look, in-world console, viewing hall, exit corridor. |
| 3. Instrument | Hold-Q overlay that reads and adjusts laws, with a virtual cursor under pointer lock. |
| 4. Visual pass | Materials, lighting, post-processing, sound. Playtest feedback moved the lights off the ceiling, because an overhead light glared off the console. |
| 5. Second gallery | Restless Pendulum; multiple worlds and handover; game state. |
| 6. Combined rules | Leaning Pendulum, the gravity + damping trade-off. |
| 7. Optics | Hidden Door: a 2D beam tracer with Snell's law and total internal reflection. |
| After the plan | Touch controls, pause, saved progress with a visitor's ticket, an instrument that hides undiscovered laws, streaming, the museum in floors, and Galleries VII–XV. |

### The development harness

These pieces let changes be verified without someone watching the screen:

- **`npm run check`:** typecheck, oxlint, around 100 unit and headless tests, and a physics
  step-time benchmark. It runs in CI and in the Stop hook.
- **Puzzle solver (`npm run solve`):** enumerates move sequences within each room's budget,
  at several timings, and asserts four thresholds per room: it is solvable, there are no
  shortcuts, brute force rarely works, and the intended solution is robust under jitter.
  Share of sequences that solve each room: Gallery I 2.8%, Gallery II 13.6%, Gallery III
  0.6%. For Gallery IV every one of the 720 arrangements is checked, and only the correct
  law works.
- **Record and replay:** every rule change and player input is stamped with the physics step.
  Recordings made in the browser replay in Node and must end identically. They do, to the
  millimetre.
- **`npm run ui-check`:** a headless Chrome run with a real pointer lock. It walks through
  every gallery, uses the instrument, clicks controls, and checks that each reset stays
  local. It runs in CI.
- **`npm run screenshots`:** about 40 set states captured from the real build and reviewed
  after visual changes.

### Problems the harness caught

- The solver found a lucky "rolling" shortcut in Gallery I. Rapier has no rolling friction,
  so the ball was given rolling resistance.
- Replays drifted by fractions of a millimetre, because Rapier stores the timestep as a
  32-bit float. Replays now use the game's exact constant.
- Resetting a room from the exit corridor shut the player out. Players in a doorway or beyond
  are now moved back inside.
- With three galleries, every light in the scene made each frame much heavier. Lights are now
  culled by distance.
- A pendulum robustness check modelled a player acting on a timer rather than reacting to a
  bell. The check was rewritten.

Each gotcha is recorded in `CLAUDE.md`.

## Status and next steps

All plan milestones are complete. What remains:

- **A real playtest.** Each room has passed its automated checks, but none has yet met the
  plan's main bar: a new player solving it and explaining why it worked. Recordings
  (Shift+D) from playtests can be added as replay tests.
- **Backlog:**
  - galleries for waves and thermodynamics;
  - a hub gallery;
  - hints;
  - modelled 3D rooms in place of the boxes;
  - later galleries reacting to how earlier ones were solved (the game state is recorded but
    not yet used);
  - a frame-rate measurement on real GPUs.

See `docs/concept.md` for the vision, `docs/plan.md` for the plan with notes on what was
actually built, and `CLAUDE.md` for commands, architecture rules and gotchas.
