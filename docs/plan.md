# Getting Started Plan

How we go from an empty repo to a first playable exhibit, then grow from there.
See [concept.md](concept.md) for the game vision.

## Guiding principle

**Prove the puzzle is fun before making it pretty or walkable.** Build the first exhibit as a
gray box with a fixed camera, get the observe → experiment → solve loop working, and only then
add first-person movement and the visual pass.

## Tech stack

| Concern            | Choice                                   | Notes |
| ------------------ | ---------------------------------------- | ----- |
| Language / build   | TypeScript + Vite                        | Fast dev server, hot reload, simple static build. |
| Rendering          | `three`                                  | Three.js draws the scene. |
| Physics            | `@dimforge/rapier3d-compat`              | Rapier runs the simulation. The `-compat` build embeds the WASM, so there's no bundler config. |
| Input / camera     | `PointerLockControls` (three/addons)     | First-person look, added in Milestone 3. |
| Player movement    | Rapier `KinematicCharacterController`    | Replaces the octree collision from the three.js FPS example, so the player and the props live in one physics world. |
| Interaction        | `THREE.Raycaster` from screen centre     | As in the "interactive cubes" example. |
| Debug UI           | `lil-gui` + `stats.js`                   | Tweak gravity and damping live while designing puzzles. |
| Assets (later)     | glTF via `GLTFLoader`                    | Gray boxes first; models replace them later. |

### Reference examples (official three.js gallery)

- **games_fps**: walking and colliding in a 3D environment (borrow the feel, not the collision code).
- **physics_rapier_basic**: Rapier set up alongside three.js; the starting point for the ball/ramp.
- **webgl_interactive_cubes**: raycast picking of the object under the cursor.
- **physics_rapier_joints**: the starting point for the broken pendulum exhibit.
- **webgl_lightprobe / Sponza**, **webgl_lights_spotlight**, **webgl_loader_gltf**: atmosphere and asset loading for the visual pass.

## Architecture sketch

Keep three ideas separate from day one so that rooms stay easy to add:

1. **Engine loop:** a fixed physics timestep (e.g. 60 Hz) with render interpolation. Each
   frame: step Rapier, then copy body transforms to their meshes.
2. **Rules:** each room owns a `RuleSet`, a small data object describing its physics:
   ```ts
   interface RuleSet {
     gravity: THREE.Vector3;       // world.gravity
     linearDamping: number;        // negative = gains energy
     restitution: number;
     // later: refractiveIndex, heatFlowSign, ...
   }
   ```
   The instrument reads and writes the `RuleSet`, and the room applies it to the Rapier world and
   bodies. Puzzles become "which rules, in which order".
3. **Exhibits:** each room is a module with a common interface:
   ```ts
   interface Exhibit {
     build(ctx: GameContext): void;   // meshes, colliders, lights
     rules: RuleSet;
     editable: (keyof RuleSet)[];     // what the instrument may change here
     budget: number;                  // how many changes are allowed
     update(dt: number): void;        // per-frame logic
     isSolved(): boolean;
     dispose(): void;
   }
   ```

Proposed layout:

```
src/
  main.ts              # bootstrap, renderer, loop
  engine/
    loop.ts            # fixed-timestep loop
    physics.ts         # Rapier world wrapper, body<->mesh sync
    input.ts           # keyboard / mouse / pointer lock
    interaction.ts     # raycast picking, "use" action
  rules/
    RuleSet.ts
    instrument.ts      # inspect / adjust UI and budget
  exhibits/
    Exhibit.ts
    sideways-gravity/  # first exhibit
    pendulum/          # second exhibit
  ui/                  # HUD, instrument overlay
public/
  assets/              # textures, glTF, audio
docs/
```

## Milestones

### Milestone 0: Scaffold (½ day)
- `npm create vite@latest` (vanilla-ts), add `three`, `@types/three`, `@dimforge/rapier3d-compat`, `lil-gui`.
- Renderer, camera, one light, a floor, an orbit camera for debugging.
- Rapier initialised, with a cube falling onto the floor and synced to its mesh.
- **Done when:** `npm run dev` shows a cube falling and landing.

### Milestone 1: Gray-box "sideways gravity" exhibit, fixed camera (1–2 days)
The first puzzle, from the brief:
1. The room contains a marble ball, a raised target, and a brass control panel.
2. The ball is too heavy to carry and can't reach the target under normal gravity.
3. The player uses the panel to rotate gravity toward a wall. The ball rolls across the room onto a track.
4. The player restores downward gravity. The ball drops onto the target and the next door opens.

Tasks:
- Build the room from boxes: floor, walls, track/ledge, target pedestal, door.
- Ball as a dynamic rigid body; target as a **sensor collider** that fires on contact.
- Gravity changes via `world.gravity = {x, y, z}`. **Gotcha:** sleeping bodies don't react to a
  gravity change, so call `body.wakeUp()` on every dynamic body when gravity changes.
- Temporary control: lil-gui buttons or number keys for "gravity down / left / right".
- Door opens (animate a kinematic body) when the sensor reports the ball.
- **Done when:** someone who hasn't seen it can solve the room in a couple of minutes, and it
  feels satisfying to watch.

### Milestone 2: Interaction and the instrument v0 (1–2 days)
- Raycast from screen centre and highlight the object under the cursor (emissive tint).
- Click the brass panel to cycle gravity direction instead of using debug keys.
- Instrument overlay (HTML/CSS on top of the canvas): shows the room's `RuleSet`, which fields
  are editable, and the remaining change budget.
- Reset room button (essential for experimentation).
- **Done when:** the puzzle is solvable using only in-world interaction and the instrument.

### Milestone 3: First-person movement (2–3 days)
- `PointerLockControls` for look; WASD moves a capsule via Rapier's `KinematicCharacterController`.
- **Design decision needed:** is the player affected by room gravity? Recommendation for v1: the
  player is **not** affected (the instrument "anchors" you), which keeps movement simple and the
  puzzle readable. Revisit later as a possible mechanic.
- Walk from an entrance corridor, through the exhibit, out the opened door.
- **Done when:** the full room is playable in first person without the debug camera.

### Milestone 4: Visual pass on one room (2–4 days)
- PBR marble (floor/walls) and brass (panel, rails) using CC0 textures (e.g. ambientCG, Poly Haven).
- An HDR environment map for reflections; spotlights over exhibits; shadows on key objects only.
- Tone mapping (ACES/AgX), a subtle bloom on brass and emissive highlights.
- Floating dust/debris particles to sell "broken physics".
- Basic audio: footsteps, ball rolling, a gravity-shift sound.
- Keep an eye on performance: target 60 fps on a mid-range laptop.
- **Done when:** a screenshot of the room conveys the art direction.

### Milestone 5: Second exhibit, the broken pendulum (2–3 days)
- Pendulum built with a Rapier revolute or spherical joint (from the joints example).
- Broken rule: **negative damping**; the pendulum gains energy each swing and shakes the room
  (camera shake, rattling debris).
- Puzzle options: restore damping, or use timed impulses / gravity changes to make it strike a
  sequence of targets before stabilising it.
- Reuses `RuleSet`, the instrument, and the exhibit interface, which validates the architecture.
- **Done when:** two rooms are connected by a corridor and playable back to back.

### Milestone 6: Combine rules and add trade-offs
- A third room that needs both gravity direction and damping.
- Introduce a "restoring one law worsens another" decision.
- Start the optics exhibit (light beam via raycasts drawn as glowing lines, mirrors, and a
  broken refractive index that reveals a hidden door).

## Later backlog

- Optics, waves (resonance), and thermodynamics (reversed heat flow) exhibits.
- Save/load progress between rooms.
- Hub gallery connecting exhibits; museum map.
- Hint system ("museum placards" that explain the real law).
- Replace gray boxes with modeled glTF rooms and props.

## Risks and how we'll handle them

| Risk | Mitigation |
| ---- | ---------- |
| Physics puzzles feel random or finicky | Design for robust outcomes (tracks, funnels, walls), test with a reset button, tune in lil-gui. |
| Integrating the FPS controller with Rapier | Use Rapier's character controller from the start instead of porting the octree approach. |
| Visual ambition slows progress | Strict gray-box-first rule; the visual pass happens per room, after it's fun. |
| Performance with shadows and physics | Limit shadow-casting lights; sleep bodies; profile early with stats.js. |

## Open questions

1. Does room gravity affect the player? (Recommendation above: not in v1.)
2. How is the instrument budget expressed: number of changes, an energy meter, or fixed "slots"?
3. Target platform: desktop browser only, or also touch/mobile?
4. Is there a narrative layer (who broke the museum?), and how much text?

## Immediate next steps

1. Milestone 0 scaffold.
2. Gray-box the sideways-gravity room with debug-key gravity control.
3. Playtest it before writing any instrument or movement code.
