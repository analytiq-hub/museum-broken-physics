// First-person player: a kinematic capsule moved by Rapier's character
// controller. The player has their own downward gravity and ignores the room's
// (the instrument "anchors" them). Sim only: no three.js, no DOM.
//
// The player's state lives here, not in the physics world, so it survives an
// exhibit reset: detach() before the world is replaced, attach() after.
import type RAPIER from "@dimforge/rapier3d-compat";
import { PLAYER_GROUPS } from "./groups";

export interface PlayerInput {
  /** -1..1, positive = forward. */
  forward: number;
  /** -1..1, positive = right. */
  right: number;
  /** Heading in radians; 0 faces north (−z), positive turns left (three.js convention). */
  yaw: number;
}

export const PLAYER = {
  radius: 0.3,
  /** Half the cylinder part; total height = 2 * (halfHeight + radius) = 1.7 m. */
  halfHeight: 0.55,
  /** Eye height above the floor. */
  eyeHeight: 1.6,
  walkSpeed: 3.2,
  gravity: 9.81,
  maxFallSpeed: 20,
} as const;

/** Capsule centre height when standing on a floor at y = 0. */
const STAND_Y = PLAYER.halfHeight + PLAYER.radius;

export type Vec3 = { x: number; y: number; z: number };

/** Everything needed to put the player back exactly (recordings, replays). */
export interface PlayerState {
  position: Vec3;
  verticalSpeed: number;
}

export class Player {
  /** Capsule centre, after the latest step. */
  position: Vec3;
  /** Capsule centre, before the latest step (for render interpolation). */
  previous: Vec3;
  grounded = false;

  private readonly R: typeof RAPIER;
  private verticalSpeed = 0;
  private world: RAPIER.World | undefined;
  private body: RAPIER.RigidBody | undefined;
  private collider: RAPIER.Collider | undefined;
  private controller: RAPIER.KinematicCharacterController | undefined;

  /** `feet` is a floor position; the capsule is placed standing on it. */
  constructor(R: typeof RAPIER, feet: Vec3) {
    this.R = R;
    this.position = { x: feet.x, y: feet.y + STAND_Y, z: feet.z };
    this.previous = { ...this.position };
  }

  /** Creates the player's body and controller in `world` at the current position. */
  attach(world: RAPIER.World): void {
    const R = this.R;
    this.world = world;
    this.body = world.createRigidBody(
      R.RigidBodyDesc.kinematicPositionBased().setTranslation(this.position.x, this.position.y, this.position.z),
    );
    this.collider = world.createCollider(
      R.ColliderDesc.capsule(PLAYER.halfHeight, PLAYER.radius).setCollisionGroups(PLAYER_GROUPS),
      this.body,
    );
    const controller = world.createCharacterController(0.02);
    controller.setUp({ x: 0, y: 1, z: 0 });
    controller.enableAutostep(0.3, 0.2, false);
    controller.enableSnapToGround(0.3);
    controller.setMaxSlopeClimbAngle((45 * Math.PI) / 180);
    controller.setApplyImpulsesToDynamicBodies(false);
    this.controller = controller;
  }

  /** Removes the body and controller from the world (call before the world is replaced). */
  detach(): void {
    if (!this.world) return;
    if (this.controller) this.world.removeCharacterController(this.controller);
    if (this.body) this.world.removeRigidBody(this.body);
    this.world = this.body = this.collider = this.controller = undefined;
  }

  /** Moves the player by one fixed step. Call before the world steps. */
  step(input: PlayerInput, dt: number): void {
    if (!this.controller || !this.collider || !this.body) return;
    this.previous = { ...this.position };

    // Horizontal intent from the heading; diagonal input isn't faster.
    let f = clamp(input.forward);
    let r = clamp(input.right);
    const len = Math.hypot(f, r);
    if (len > 1) {
      f /= len;
      r /= len;
    }
    const sin = Math.sin(input.yaw);
    const cos = Math.cos(input.yaw);
    const speed = PLAYER.walkSpeed * dt;
    const dx = (-sin * f + cos * r) * speed;
    const dz = (-cos * f - sin * r) * speed;

    this.verticalSpeed = Math.max(this.verticalSpeed - PLAYER.gravity * dt, -PLAYER.maxFallSpeed);
    const desired = { x: dx, y: this.verticalSpeed * dt, z: dz };

    this.controller.computeColliderMovement(this.collider, desired, undefined, PLAYER_GROUPS);
    const move = this.controller.computedMovement();
    this.grounded = this.controller.computedGrounded();
    if (this.grounded) this.verticalSpeed = 0;

    this.position = { x: this.position.x + move.x, y: this.position.y + move.y, z: this.position.z + move.z };
    this.body.setNextKinematicTranslation(this.position);
  }

  /** Teleports the player (debug and tests). `feet` is a floor position. */
  placeAt(feet: Vec3): void {
    this.position = { x: feet.x, y: feet.y + STAND_Y, z: feet.z };
    this.previous = { ...this.position };
    this.verticalSpeed = 0;
    this.body?.setTranslation(this.position, true);
  }

  /** Moves the player (and the last step, so the view doesn't jump) into another room's coordinates. */
  shift(dx: number, dy: number): void {
    this.position = { x: this.position.x + dx, y: this.position.y + dy, z: this.position.z };
    this.previous = { x: this.previous.x + dx, y: this.previous.y + dy, z: this.previous.z };
    this.body?.setTranslation(this.position, true);
  }

  /** Takes back the last step (held at a corridor's midpoint until the next room is built). */
  undoStep(): void {
    this.position = { ...this.previous };
    this.verticalSpeed = 0;
    this.body?.setTranslation(this.position, true);
  }

  getState(): PlayerState {
    return { position: { ...this.position }, verticalSpeed: this.verticalSpeed };
  }

  /** Restores getState(). Call before attach(), or the body won't follow. */
  setState(state: PlayerState): void {
    this.position = { ...state.position };
    this.previous = { ...state.position };
    this.verticalSpeed = state.verticalSpeed;
    this.body?.setTranslation(this.position, true);
  }

  /** Floor position under the capsule. */
  get feet(): Vec3 {
    return { x: this.position.x, y: this.position.y - STAND_Y, z: this.position.z };
  }
}

function clamp(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
