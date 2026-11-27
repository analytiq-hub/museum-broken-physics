// The museum's rooms, east to west, as plain data: what the game needs to know
// about a gallery without building it. Each gallery's code (its exhibit, view,
// textures and sounds) is its own chunk, loaded by `load()` only when the player
// comes near; main.ts keeps at most three rooms built at once.
//
// layout.ts stays the single source of where rooms are: the handover lines
// between neighbours come from there.
import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { Sound } from "../audio/sound";
import type { Player } from "../engine/player";
import { HANDOVER_X, HANDOVER_X_23, HANDOVER_X_34, HANDOVER_X_45, HANDOVER_X_56 } from "../exhibits/layout";
import type { Materials } from "../render/materials";
import type { Gallery } from "./gallery";

export type GalleryFactory = (
  R: typeof RAPIER,
  scene: THREE.Object3D,
  materials: Materials,
  sound: Sound,
  getPlayer: () => Player,
) => Gallery;

export interface Room {
  id: string;
  title: string;
  /** Laws the player can change here, so solving the room teaches them (the instrument's `knownLaws`). */
  laws: readonly string[];
  /** Orbit-camera poses the gallery's view defines (debug API, screenshots). */
  cameras: readonly string[];
  /** Builds the gallery: imports its chunk first. */
  load(): Promise<GalleryFactory>;
}

export const ROOMS: readonly Room[] = [
  {
    id: "sideways-gravity",
    title: "The Sideways Gallery",
    laws: ["gravity"],
    cameras: ["window", "overview", "ledge"],
    load: async () => (await import("./sidewaysGallery")).createSidewaysGallery,
  },
  {
    id: "pendulum",
    title: "The Restless Pendulum",
    laws: ["damping"],
    cameras: ["pendulum", "pendulum-low"],
    load: async () => (await import("./pendulumGallery")).createPendulumGallery,
  },
  {
    id: "leaning-pendulum",
    title: "The Leaning Pendulum",
    laws: ["gravity", "damping"],
    cameras: ["leaning", "leaning-low"],
    load: async () => (await import("./leaningGallery")).createLeaningGallery,
  },
  {
    id: "optics",
    title: "The Hidden Door",
    laws: ["index"],
    cameras: ["optics", "optics-door"],
    load: async () => (await import("./opticsGallery")).createOpticsGallery,
  },
  {
    id: "bouncing",
    title: "The Bouncing Hall",
    laws: ["bounce"],
    cameras: ["bouncing", "bouncing-balcony"],
    load: async () => (await import("./bouncingGallery")).createBouncingGallery,
  },
  {
    id: "singing-glass",
    title: "The Singing Glass",
    laws: ["speed"],
    cameras: ["singing", "singing-harmonica", "singing-pane"],
    load: async () => (await import("./singingGallery")).createSingingGallery,
  },
];

/** The handover line between room i and room i + 1 (corridor midpoints), east to west. */
const HANDOVERS = [HANDOVER_X, HANDOVER_X_23, HANDOVER_X_34, HANDOVER_X_45, HANDOVER_X_56];

/**
 * Is floor x on room `index`'s side of the museum? `margin` widens the room (positive,
 * so a player standing on a line doesn't flip worlds every step) or narrows it.
 */
export function roomOwns(index: number, x: number, margin: number): boolean {
  const east = index > 0 ? HANDOVERS[index - 1] : Infinity;
  const west = index < ROOMS.length - 1 ? HANDOVERS[index] : -Infinity;
  return x < east + margin && x > west - margin;
}

/** The room whose side of the museum floor x is on. */
export function roomAt(x: number): number {
  return HANDOVERS.filter((line) => x < line).length;
}

export function roomIndex(id: string): number {
  return ROOMS.findIndex((room) => room.id === id);
}

/** The rooms kept built around room `index`: it and its neighbours. */
export function liveAround(index: number): number[] {
  return [index - 1, index, index + 1].filter((i) => i >= 0 && i < ROOMS.length);
}
