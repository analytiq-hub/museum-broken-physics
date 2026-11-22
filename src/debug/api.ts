// window.__game: a small API for driving the real build from browser
// automation (Playwright screenshots) or the devtools console.
//
//   __game.setCamera("overview")
//   __game.setRule("gravity", "north"); __game.settle()
//   __game.getState()
//
// Load with ?paused so the frame loop doesn't advance the simulation on its own.
import type { ExhibitState } from "../exhibits/Exhibit";
import type { Recording } from "./recorder";

export interface GameDebugApi {
  /** True once the exhibit is built and the first frame can render. */
  ready: boolean;
  getState(): ExhibitState;
  /** Changes a rule the way the player's controls do (recorded). */
  setRule(id: string, value: unknown): boolean;
  /** This session's attempts so far. */
  getRecording(): Recording;
  /** Advances the simulation by `n` fixed steps. */
  step(n?: number): void;
  /** Steps until the room is at rest (or solved/failed). Returns steps taken. */
  settle(maxSteps?: number): number;
  reset(): void;
  setPaused(paused: boolean): void;
  /** Names accepted by setCamera(). */
  cameras: string[];
  setCamera(name: string): void;
  /** Resolves after the next two rendered frames, so a screenshot shows the latest state. */
  nextFrame(): Promise<void>;
}

declare global {
  interface Window {
    __game?: GameDebugApi;
  }
}

export function installDebugApi(api: Omit<GameDebugApi, "ready" | "nextFrame">): void {
  window.__game = {
    ...api,
    ready: true,
    nextFrame: () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  };
}
