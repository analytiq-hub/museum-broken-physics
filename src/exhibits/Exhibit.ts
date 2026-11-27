// Common simulation side of every exhibit. Sim only: no three.js, no DOM.
// Each exhibit's view is a separate function (view.ts) that reads this object.
import type RAPIER from "@dimforge/rapier3d-compat";
import { createWorld } from "../engine/physics";
import type { Rule, SimContext } from "../rules/Rule";

/** Plain-data dump of an exhibit, for tests, the solver, debugging and screenshots. */
export interface ExhibitState {
  exhibit: string;
  step: number;
  rules: Record<string, unknown>;
  changesUsed: number;
  budget: number;
  solved: boolean;
  failed: boolean;
  settled: boolean;
  bodies: Record<string, { pos: [number, number, number]; speed: number }>;
}

/** Everything needed to put an exhibit back exactly as it was at some step. */
export interface ExhibitSave {
  world: Uint8Array;
  rules: unknown[];
  changesUsed: number;
  stepCount: number;
  calmSteps: number;
  extra: unknown;
}

/** Below this speed (m/s and rad/s) every dynamic body counts as at rest. */
const CALM_SPEED = 0.05;
/** Steps all bodies must stay calm to count as settled. */
const CALM_STEPS = 20;
/** restoreSolved() runs the room this long (5 s) so doors are open and things are still. */
const RESTORE_STEPS = 300;

export abstract class ExhibitBase {
  readonly id: string;
  readonly R: typeof RAPIER;
  readonly budget: number;
  world: RAPIER.World;
  rules: Rule[] = [];
  changesUsed = 0;
  stepCount = 0;

  private initial: ExhibitSave | undefined;
  private calmSteps = 0;

  constructor(id: string, R: typeof RAPIER, budget: number) {
    this.id = id;
    this.R = R;
    this.budget = budget;
    this.world = createWorld(R);
  }

  /** Subclasses call this at the end of their constructor, after building bodies and rules. */
  protected finishSetup(): void {
    for (const rule of this.rules) rule.apply(this.ctx);
    this.initial = this.save();
  }

  get ctx(): SimContext {
    return { R: this.R, world: this.world };
  }

  get changesLeft(): number {
    return this.budget - this.changesUsed;
  }

  rule(id: string): Rule {
    const rule = this.rules.find((r) => r.id === id);
    if (!rule) throw new Error(`${this.id}: no rule "${id}"`);
    return rule;
  }

  /**
   * Changes a rule, spending one unit of budget. Returns false (and changes
   * nothing) if the rule isn't editable, the value is unchanged or invalid,
   * the budget is spent, or the room is already solved or failed.
   */
  setRule(id: string, value: unknown): boolean {
    const rule = this.rule(id);
    if (!rule.editable || rule.current === value) return false;
    if (!rule.control && this.changesLeft <= 0) return false;
    if (this.isSolved() || this.isFailed()) return false;
    if (rule.kind === "choice" && !rule.options?.some((o) => o.value === value)) return false;
    if (rule.kind === "range" && typeof value !== "number") return false;
    if (rule.kind === "range" && rule.range && (Number(value) < rule.range.min || Number(value) > rule.range.max)) return false;
    rule.current = value;
    rule.apply(this.ctx);
    if (!rule.control) this.changesUsed++;
    this.calmSteps = 0; // the room is about to move again
    return true;
  }

  /** One fixed physics step, with the exhibit's logic before and after it. */
  step(): void {
    this.beforeStep();
    this.world.step();
    this.stepCount++;
    this.afterStep();
    this.calmSteps = this.maxDynamicSpeed() < CALM_SPEED ? this.calmSteps + 1 : 0;
  }

  /** True once every dynamic body has been at rest for a short while. */
  isSettled(): boolean {
    return this.calmSteps >= CALM_STEPS;
  }

  /** Steps until settled, solved or failed, up to `maxSteps`. Returns the steps taken. */
  stepUntilSettled(maxSteps = 600): number {
    let n = 0;
    while (n < maxSteps && !this.isSettled() && !this.isFailed()) {
      this.step();
      n++;
    }
    return n;
  }

  /** Restores the initial state, rule values and budget. Experimenting is free. */
  reset(): void {
    if (!this.initial) throw new Error(`${this.id}: finishSetup() was never called`);
    this.load(this.initial);
  }

  /**
   * Puts the room in its finished state, as a returning visitor left it (saved
   * progress): every law back at its correct value, the puzzle pieces where a
   * solve leaves them, solved, and the door open. Steps the world a few seconds
   * so the door has sunk and things have come to rest.
   */
  restoreSolved(): void {
    this.reset();
    for (const rule of this.rules) {
      if (rule.control) continue;
      rule.current = rule.nominal;
      rule.apply(this.ctx);
    }
    this.arrangeSolved();
    this.world.forEachRigidBody((body) => body.wakeUp()); // sleeping bodies ignore gravity changes
    for (let i = 0; i < RESTORE_STEPS; i++) this.step();
  }

  /** For restoreSolved(): place the puzzle pieces, set controls and mark the room solved. */
  protected abstract arrangeSolved(): void;

  /** Captures the complete state (world, rules, budget, exhibit logic). */
  save(): ExhibitSave {
    return {
      world: this.world.takeSnapshot(),
      rules: this.rules.map((r) => r.current),
      changesUsed: this.changesUsed,
      stepCount: this.stepCount,
      calmSteps: this.calmSteps,
      extra: structuredClone(this.saveExtra()),
    };
  }

  /** Restores a state from save(). Body and collider handles stay valid. */
  load(state: ExhibitSave): void {
    const old = this.world;
    this.world = this.R.World.restoreSnapshot(state.world);
    old.free();
    this.rules.forEach((rule, i) => {
      rule.current = state.rules[i];
      rule.apply(this.ctx);
    });
    this.changesUsed = state.changesUsed;
    this.stepCount = state.stepCount;
    this.calmSteps = state.calmSteps;
    this.loadExtra(structuredClone(state.extra));
  }

  describe(): ExhibitState {
    const bodies: ExhibitState["bodies"] = {};
    for (const [name, body] of Object.entries(this.namedBodies())) {
      const t = body.translation();
      bodies[name] = { pos: [round(t.x), round(t.y), round(t.z)], speed: round(speedOf(body)) };
    }
    return {
      exhibit: this.id,
      step: this.stepCount,
      rules: Object.fromEntries(this.rules.map((r) => [r.id, r.current])),
      changesUsed: this.changesUsed,
      budget: this.budget,
      solved: this.isSolved(),
      failed: this.isFailed(),
      settled: this.isSettled(),
      bodies,
    };
  }

  dispose(): void {
    this.world.free();
  }

  abstract isSolved(): boolean;
  abstract isFailed(): boolean;
  /** Bodies worth reporting in describe(), by name. */
  protected abstract namedBodies(): Record<string, RAPIER.RigidBody>;
  /** Per-step logic before world.step() (kinematic motion, custom forces). */
  protected beforeStep(): void {}
  /** Per-step logic after world.step() (sensors, solve detection). */
  protected afterStep(): void {}
  /** Exhibit-specific state to include in save() (plain data). */
  protected saveExtra(): unknown {
    return undefined;
  }
  /** Restores what saveExtra() returned. */
  protected loadExtra(_extra: unknown): void {}
  /**
   * Bodies whose motion decides whether the room has settled. Defaults to every
   * dynamic body; exhibits exclude purely decorative ones (tell-tales).
   */
  protected settleBodies(): RAPIER.RigidBody[] | undefined {
    return undefined;
  }

  private maxDynamicSpeed(): number {
    const bodies = this.settleBodies();
    if (bodies) return Math.max(0, ...bodies.map(speedOf));
    let max = 0;
    this.world.forEachRigidBody((body) => {
      if (body.isDynamic()) max = Math.max(max, speedOf(body));
    });
    return max;
  }
}

function speedOf(body: RAPIER.RigidBody): number {
  const v = body.linvel();
  const w = body.angvel();
  return Math.max(Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
