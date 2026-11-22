// View side: binds three.js objects to Rapier bodies and draws them
// interpolated between the previous and current physics step.
// Rapier doesn't interpolate, so each binding keeps both transforms.
import type RAPIER from "@dimforge/rapier3d-compat";
import * as THREE from "three";

interface Binding {
  handle: number;
  body: RAPIER.RigidBody;
  object: THREE.Object3D;
  prevPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currPos: THREE.Vector3;
  currRot: THREE.Quaternion;
}

export class BodySync {
  private bindings: Binding[] = [];

  /** Binds `object` to `body`. The object's transform is driven by the body from now on. */
  bind(body: RAPIER.RigidBody, object: THREE.Object3D): void {
    const b: Binding = {
      handle: body.handle,
      body,
      object,
      prevPos: new THREE.Vector3(),
      prevRot: new THREE.Quaternion(),
      currPos: new THREE.Vector3(),
      currRot: new THREE.Quaternion(),
    };
    this.bindings.push(b);
    this.snap(b);
  }

  /** Call before each physics step: the current state becomes the previous one. */
  beforeStep(): void {
    for (const b of this.bindings) {
      b.prevPos.copy(b.currPos);
      b.prevRot.copy(b.currRot);
    }
  }

  /** Call after each physics step: read the new state from the bodies. */
  afterStep(): void {
    for (const b of this.bindings) this.read(b);
  }

  /** Writes interpolated transforms to the bound objects. `alpha` comes from FixedStepper.advance. */
  render(alpha: number): void {
    for (const b of this.bindings) {
      b.object.position.lerpVectors(b.prevPos, b.currPos, alpha);
      b.object.quaternion.slerpQuaternions(b.prevRot, b.currRot, alpha);
    }
  }

  /** Re-attaches every binding to the body with the same handle in `world` (after a snapshot restore). */
  rebind(world: RAPIER.World): void {
    for (const b of this.bindings) {
      b.body = world.getRigidBody(b.handle);
      this.snap(b);
    }
  }

  private read(b: Binding): void {
    const t = b.body.translation();
    const r = b.body.rotation();
    b.currPos.set(t.x, t.y, t.z);
    b.currRot.set(r.x, r.y, r.z, r.w);
  }

  /** Sets previous = current = body, so there is nothing to interpolate across. */
  private snap(b: Binding): void {
    this.read(b);
    b.prevPos.copy(b.currPos);
    b.prevRot.copy(b.currRot);
    b.object.position.copy(b.currPos);
    b.object.quaternion.copy(b.currRot);
  }
}
