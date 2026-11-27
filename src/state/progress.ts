// Saved progress: which galleries are solved and which one the visitor was in,
// kept in this browser's localStorage. Storage can be missing or blocked
// (private windows, previews), so every access is guarded and the game simply
// starts fresh without it.
import type { GalleryOutcome } from "./gameState";

const KEY = "museum-broken-physics/progress";
const VERSION = 1;

export interface SavedProgress {
  version: typeof VERSION;
  /** Solved galleries by id, with the laws they were left with. */
  solved: Record<string, GalleryOutcome>;
  /** The gallery the visitor was in. */
  gallery: string;
}

export function loadProgress(): SavedProgress | undefined {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const data = JSON.parse(raw) as Partial<SavedProgress>;
    if (data.version !== VERSION || typeof data.gallery !== "string" || typeof data.solved !== "object" || !data.solved) return undefined;
    return data as SavedProgress;
  } catch {
    return undefined;
  }
}

export function saveProgress(progress: Omit<SavedProgress, "version">): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: VERSION, ...progress }));
  } catch {
    // No storage: progress lasts until the page closes.
  }
}

export function clearProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
