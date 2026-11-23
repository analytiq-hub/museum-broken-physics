// Progress through the museum: which galleries are solved, and with which
// laws left in place. Later galleries read it for trade-offs; save/load will
// serialise it. Plain data, no DOM.

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

  toJSON(): Record<string, GalleryOutcome> {
    return Object.fromEntries(this.solved);
  }
}
