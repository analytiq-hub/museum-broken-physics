// Progress through the museum: which galleries are solved, and with which
// laws left in place. Later galleries read it for trade-offs; src/state/progress.ts
// saves it. Plain data, no DOM.

export interface GalleryOutcome {
  /** Rule values when the gallery was solved. */
  rules: Record<string, unknown>;
}

export class GameState {
  readonly solved = new Map<string, GalleryOutcome>();

  markSolved(galleryId: string, rules: Record<string, unknown>): void {
    if (!this.solved.has(galleryId)) this.solved.set(galleryId, { rules: { ...rules } });
  }

  isSolved(galleryId: string): boolean {
    return this.solved.has(galleryId);
  }

  /** Replaces everything with saved progress (toJSON() output). */
  load(solved: Record<string, GalleryOutcome>): void {
    this.solved.clear();
    for (const [id, outcome] of Object.entries(solved)) this.solved.set(id, outcome);
  }

  clear(): void {
    this.solved.clear();
  }

  toJSON(): Record<string, GalleryOutcome> {
    return Object.fromEntries(this.solved);
  }
}
