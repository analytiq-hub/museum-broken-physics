// A room with nothing to solve (the stairs, the closing room): static boxes, fixed
// gravity, no laws to change. Sim only: no three.js, no DOM.
import type RAPIER from "@dimforge/rapier3d-compat";
import { gravityRule } from "../rules/Rule";
import { ExhibitBase } from "./Exhibit";
import { addStaticBoxes, type Box } from "./layout";

export class PassageExhibit extends ExhibitBase {
  constructor(R: typeof RAPIER, id: string, boxes: readonly Box[]) {
    super(id, R, 0);
    addStaticBoxes(R, this.world, this.world.createRigidBody(R.RigidBodyDesc.fixed()), boxes);
    this.rules = [gravityRule("down", ["down"], { down: "Floor" }, false)];
    this.finishSetup();
  }

  isSolved(): boolean {
    return false;
  }

  isFailed(): boolean {
    return false;
  }

  protected namedBodies(): Record<string, RAPIER.RigidBody> {
    return {};
  }

  protected arrangeSolved(): void {}
}
