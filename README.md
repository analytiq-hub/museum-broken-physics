# The Museum of Broken Physics

A Three.js puzzle adventure where the laws of physics are malfunctioning, and you repair them. Six galleries so far: the Sideways Gallery (gravity), the Restless Pendulum (damping), the Leaning Pendulum (both, in the right order), the Hidden Door (light), the Bouncing Hall (bounce) and the Singing Glass (sound).

**Play the latest build:** https://analytiqhub.com/museum-broken-physics/ (deployed from `main` after CI passes)

**Controls:** click to enter, WASD to walk, mouse to look, click the brass buttons on the
gravity console to change where "down" points, hold Q for your physics instrument, R to reset, M to mute, Esc to pause. C switches to the view
through the window (arrow keys and Space set gravity there). Add `?debug` for the debug panel.

**On a phone or tablet:** tap to enter, drag with your left thumb to walk (a joystick appears
under it), drag with your right thumb to look, tap brass buttons and mirrors to use them,
**Laws** opens the physics instrument, **Reset** restarts the room, **❚❚** pauses. Landscape
works best.

**Progress is saved** in your browser: come back later and the start card shows your visitor's
ticket, with a stamp for each gallery restored, and offers to continue or start a new visit.

## How it was built

The game is TypeScript and Vite, with **three.js** for rendering and **Rapier** (WASM) for
physics. It was built with Claude Code, milestone by milestone, following
[docs/plan.md](docs/plan.md). Every milestone was committed, tested in CI and deployed before
the next one started.

- **Simulation and view are separate.** Each gallery's physics (`src/exhibits/*/sim.ts`)
  never touches three.js or the page, so whole rooms run headlessly in Node for tests.
- **Physical laws are data.** A law records its current value, the correct value and a
  plain-language explanation. The in-game instrument displays and edits any law without
  gallery-specific code.
- **One physics world per gallery,** joined by corridors that exist in both worlds. Physics
  runs at a fixed 60 Hz, so it is fully deterministic.
- **Changes are checked by machine, not by eye:**
  - `npm run check`: typecheck, lint, unit tests and a performance benchmark. It runs in CI
    and before any Claude Code session can finish.
  - `npm run solve`: a puzzle solver that tries every move sequence and asserts each room is
    solvable, has no shortcuts and resists button-mashing.
  - Replays: recorded browser sessions replay in Node and must end identically.
  - `npm run ui-check`: plays the real game in headless Chrome, with a real pointer lock.
  - `npm run screenshots`: captures set states from the real build for visual review.
- **Assets:** CC0 textures and an HDRI from Poly Haven ([credits](public/assets/CREDITS.md)).
  Brass, wood, placards and all sound are generated in code.

The full story, including what the tests caught along the way, is in
[docs/project-summary.md](docs/project-summary.md).

## Docs

- [CLAUDE.md](CLAUDE.md): commands, architecture rules and gotchas for contributors
- [docs/project-summary.md](docs/project-summary.md): what was built and how
- [docs/concept.md](docs/concept.md): game concept and design pillars
- [docs/plan.md](docs/plan.md): tech stack, architecture, and milestone plan
