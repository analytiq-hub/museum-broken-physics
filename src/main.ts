// Browser entry point. The renderer, fixed-timestep loop and mesh binding
// arrive in Milestone 0 step 4; for now this only proves Rapier loads.
import { initPhysics } from "./engine/physics";
import { buildFallingCubeSim } from "./exhibits/falling-cube/sim";

const R = await initPhysics();
const { world } = buildFallingCubeSim(R);
document.querySelector("#app")!.textContent =
  `Rapier ready: ${world.bodies.len()} bodies in the falling-cube world.`;
