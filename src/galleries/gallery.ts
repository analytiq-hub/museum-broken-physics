// A gallery as the game runs it: its exhibit (own physics world), view,
// recorder, and the player-facing text, sounds and reset rules that differ
// between galleries. main.ts drives whichever gallery the player is in.
import type * as THREE from "three";
import type { BodySync } from "../engine/bodySync";
import type { Player } from "../engine/player";
import type { ExhibitBase } from "../exhibits/Exhibit";
import type { Recorder } from "../debug/recorder";

type V3 = [number, number, number];

/** Something in the world the player can point at and click (a console button). */
export interface Interactable {
  rule: string;
  /** The value a click sets; ignored when `cycle` is set. */
  value: unknown;
  label: string;
  /** A click steps the rule to its next option (wrapping), e.g. turning a mirror a notch. */
  cycle?: boolean;
  /** What the crosshair says once the rule already has this value (instead of "… (current)"). */
  doneLabel?: string;
  /** A toggle: clicking again, once the rule has `value`, sets it to this (an organ pipe stops). */
  offValue?: unknown;
}

export interface Gallery {
  id: string;
  /** Everything this gallery draws (main.ts switches its lights on and off). */
  group: THREE.Group;
  /** The gallery's x extent, for deciding when its lights are needed. */
  xRange: [number, number];
  /** "The Sideways Gallery". */
  title: string;
  exhibit: ExhibitBase;
  sync: BodySync;
  recorder: Recorder;
  /** Where to put the player when jumping here (debug camera switch). */
  entrance: { x: number; y: number; z: number };
  entranceYaw: number;
  /** Named orbit-camera poses for screenshots and the debug view. */
  cameraPoses: Record<string, { position: V3; target: V3 }>;
  /** In-world click targets for the crosshair raycast (userData.interact: Interactable). */
  interactables: THREE.Object3D[];
  setHovered(target: Interactable | undefined): void;
  /** One HUD line about the room's state (HTML). */
  summary(): string;
  /** The HUD's status line: goal, success or failure. */
  status(player: Player): string;
  /** Per physics step, after the world steps (impact detection, events). */
  afterStep(): void;
  /** Per rendered frame: visuals and sounds. */
  update(dt: number): void;
  /** Camera shake in metres right now (0 = none). */
  shake(): number;
  /** Before the exhibit resets: move the player out of anything about to close. */
  beforeReset(player: Player): void;
  /** After the exhibit resets. */
  afterReset(): void;
  /** Stop this gallery's continuous sounds (the player left it). */
  silence(): void;
}
