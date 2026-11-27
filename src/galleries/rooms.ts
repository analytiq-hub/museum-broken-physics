// The museum's rooms, in route order, as plain data: what the game needs to know
// about a gallery without building it, and where it sits in the museum. Each gallery's code (its exhibit, view,
// textures and sounds) is its own chunk, loaded by `load()` only when the player
// comes near; main.ts keeps at most three rooms built at once.
//
// Each room keeps the coordinates it was built in; OFFSETS places it in the museum
// so that neighbouring rooms' corridor stubs (layout.ts `corridor`) meet.
import type RAPIER from "@dimforge/rapier3d-compat";
import type * as THREE from "three";
import type { Sound } from "../audio/sound";
import type { Player } from "../engine/player";
import { CORRIDOR } from "../exhibits/layout";
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
  /** Floor 1 (mechanics) or Floor 2 (waves and light): each floor is a level, harder going up. */
  floor: number;
  /** A gallery to restore, or a passage (the stairs between floors). */
  kind: "gallery" | "passage";
  /** Laws the player can change here, so solving the room teaches them (the instrument's `knownLaws`). */
  laws: readonly string[];
  /** Orbit-camera poses the gallery's view defines (debug API, screenshots). */
  cameras: readonly string[];
  /**
   * Where its doorways are, in the room's own coordinates: the x of the east and west
   * walls' outer faces (where its corridor stubs start), and how much higher the west
   * doorway is than the east one (the stairs).
   */
  doors: { east?: number; west?: number; rise?: number };
  /** Builds the gallery: imports its chunk first. */
  load(): Promise<GalleryFactory>;
}

/**
 * The route, in order: one way through, no choices. Floor 1 is mechanics, ending
 * with the Leaning Pendulum (both of its laws were met on this floor); the Grand
 * Stair leads up to Floor 2, waves and light.
 */
export const ROOMS: readonly Room[] = [
  {
    id: "sideways-gravity",
    title: "The Sideways Gallery",
    floor: 1,
    kind: "gallery",
    laws: ["gravity"],
    cameras: ["window", "overview", "ledge"],
    doors: { west: -6.5 },
    load: async () => (await import("./sidewaysGallery")).createSidewaysGallery,
  },
  {
    id: "pendulum",
    title: "The Restless Pendulum",
    floor: 1,
    kind: "gallery",
    laws: ["damping"],
    cameras: ["pendulum", "pendulum-low"],
    doors: { east: -14.5, west: -25.5 },
    load: async () => (await import("./pendulumGallery")).createPendulumGallery,
  },
  {
    id: "bouncing",
    title: "The Bouncing Hall",
    floor: 1,
    kind: "gallery",
    laws: ["bounce"],
    cameras: ["bouncing", "bouncing-balcony"],
    doors: { east: -71.5, west: -84.5 },
    load: async () => (await import("./bouncingGallery")).createBouncingGallery,
  },
  {
    id: "leaning-pendulum",
    title: "The Leaning Pendulum",
    floor: 1,
    kind: "gallery",
    laws: ["gravity", "damping"],
    cameras: ["leaning", "leaning-low"],
    doors: { east: -33.5, west: -44.5 },
    load: async () => (await import("./leaningGallery")).createLeaningGallery,
  },
  {
    id: "stairwell",
    title: "The Grand Stair",
    floor: 1,
    kind: "passage",
    laws: [],
    cameras: ["stairwell"],
    doors: { east: 0, west: -13, rise: 4.8 },
    load: async () => (await import("./stairwellGallery")).createStairwellGallery,
  },
  {
    id: "optics",
    title: "The Hidden Door",
    floor: 2,
    kind: "gallery",
    laws: ["index"],
    cameras: ["optics", "optics-door"],
    doors: { east: -52.5, west: -63.5 },
    load: async () => (await import("./opticsGallery")).createOpticsGallery,
  },
  {
    id: "singing-glass",
    title: "The Singing Glass",
    floor: 2,
    kind: "gallery",
    laws: ["speed"],
    cameras: ["singing", "singing-harmonica", "singing-pane"],
    doors: { east: -92.5, west: -103.5 },
    load: async () => (await import("./singingGallery")).createSingingGallery,
  },
  {
    id: "chladni",
    title: "The Chladni Plates",
    floor: 2,
    kind: "gallery",
    laws: ["brass-speed"],
    cameras: ["chladni", "chladni-plate"],
    doors: { east: 0, west: -11 },
    load: async () => (await import("./chladniGallery")).createChladniGallery,
  },
  {
    id: "the-end",
    title: "The End, For Now",
    floor: 2,
    kind: "passage",
    laws: [],
    cameras: [],
    doors: { east: 0 },
    load: async () => (await import("./theEndGallery")).createTheEndGallery,
  },
];

/** Galleries only (no passages), in route order: what the ticket stamps and the HUD counts. */
export const GALLERIES = ROOMS.filter((room) => room.kind === "gallery");

/**
 * Each room's placement: how far its own coordinates are shifted to sit in the
 * museum. Rooms keep the coordinates they were built in (so their tests, solver and
 * replays never change); placing room i + 1 so that its east corridor is room i's
 * west corridor joins them up.
 */
export const OFFSETS: readonly { x: number; y: number }[] = ROOMS.reduce<{ x: number; y: number }[]>((offsets, room, i) => {
  if (i === 0) return [{ x: 0, y: 0 }];
  const prev = ROOMS[i - 1];
  const at = offsets[i - 1];
  offsets.push({ x: at.x + prev.doors.west! - CORRIDOR.length - room.doors.east!, y: at.y + (prev.doors.rise ?? 0) });
  return offsets;
}, []);

/** The handover line between room i and room i + 1 (corridor midpoints, museum x), east to west. */
const HANDOVERS = ROOMS.slice(0, -1).map((room, i) => OFFSETS[i].x + room.doors.west! - CORRIDOR.length / 2);

/**
 * Is floor x on room `index`'s side of the museum? `margin` widens the room (positive,
 * so a player standing on a line doesn't flip worlds every step) or narrows it.
 */
export function roomOwns(index: number, x: number, margin: number): boolean {
  const east = index > 0 ? HANDOVERS[index - 1] : Infinity;
  const west = index < ROOMS.length - 1 ? HANDOVERS[index] : -Infinity;
  return x < east + margin && x > west - margin;
}

/** The room whose side of the museum floor x is on (the route always runs west, floor after floor). */
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
