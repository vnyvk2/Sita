import { randomUUID } from 'node:crypto';

import type { QueueEntry, QueueEntrySource, QueueState } from './types';

export class QueueEngine {
  private state: QueueState;
  private randomizer: () => number;

  constructor(options?: { initialState?: Partial<QueueState>; randomizer?: () => number }) {
    this.randomizer = options?.randomizer ?? Math.random;
    this.state = {
      entries: [],
      history: [],
      repeatMode: 'none',
      shuffleMode: false,
      shufflePermutation: [],
      currentEntryId: undefined,
      ...options?.initialState
    };
  }

  public getState(): Readonly<QueueState> {
    return structuredClone(this.state);
  }

  /** Helper: Get the natural index of an entry by ID. */
  private getNaturalIndex(id: string): number {
    return this.state.entries.findIndex((e) => e.id === id);
  }

  /** Helper: Get the playback index for a given natural index. */
  private getPlaybackIndex(naturalIndex: number): number {
    return this.state.shufflePermutation.indexOf(naturalIndex);
  }

  /** Replace the entire queue with new songs. */
  public replaceQueue(songIds: number[], source: QueueEntrySource, startingIndex = 0): void {
    const newEntries: QueueEntry[] = songIds.map((songId) => ({
      id: randomUUID(),
      songId,
      source
    }));

    this.state.entries = newEntries;
    this.state.history = []; // Clear history on full replacement

    // By default, natural order matches playback order
    this.state.shufflePermutation = newEntries.map((_, i) => i);

    const safeIndex = Math.max(0, Math.min(startingIndex, newEntries.length - 1));
    this.state.currentEntryId = newEntries.length > 0 ? newEntries[safeIndex].id : undefined;

    if (this.state.shuffleMode && newEntries.length > 0) {
      this.recomputeShuffle();
    }
  }

  /** Add songs immediately after the current track. */
  public addNext(songIds: number[], source: QueueEntrySource): void {
    if (songIds.length === 0) return;

    const newEntries: QueueEntry[] = songIds.map((songId) => ({
      id: randomUUID(),
      songId,
      source
    }));

    if (this.state.entries.length === 0) {
      this.replaceQueue(songIds, source);
      return;
    }

    const currentNatural = this.state.currentEntryId
      ? this.getNaturalIndex(this.state.currentEntryId)
      : -1;
    let insertNaturalIndex = this.state.entries.length;
    let insertPlaybackIndex = this.state.entries.length;

    if (currentNatural !== -1) {
      insertNaturalIndex = currentNatural + 1;
      insertPlaybackIndex = this.getPlaybackIndex(currentNatural) + 1;
    }

    // Insert into natural array
    this.state.entries.splice(insertNaturalIndex, 0, ...newEntries);

    // Adjust existing permutation indices for values >= insertNaturalIndex
    this.state.shufflePermutation = this.state.shufflePermutation.map((idx) =>
      idx >= insertNaturalIndex ? idx + newEntries.length : idx
    );

    // Insert new indices into the permutation at insertPlaybackIndex
    const newIndices = newEntries.map((_, i) => insertNaturalIndex + i);
    this.state.shufflePermutation.splice(insertPlaybackIndex, 0, ...newIndices);
  }

  /** Add songs to the end of the queue. */
  public addToEnd(songIds: number[], source: QueueEntrySource): void {
    if (songIds.length === 0) return;

    if (this.state.entries.length === 0) {
      this.replaceQueue(songIds, source);
      return;
    }

    const startNaturalIdx = this.state.entries.length;
    const newEntries: QueueEntry[] = songIds.map((songId) => ({
      id: randomUUID(),
      songId,
      source
    }));

    this.state.entries.push(...newEntries);
    const newIndices = newEntries.map((_, i) => startNaturalIdx + i);

    if (this.state.shuffleMode) {
      // In shuffle mode, adding to end means we can just shuffle the new items
      // and append them, or just append them directly (so they play last).
      // We'll just append them to the end of the permutation array.
      this.state.shufflePermutation.push(...newIndices);
    } else {
      this.state.shufflePermutation.push(...newIndices);
    }
  }

  /** Remove an entry by its unique ID. */
  public removeEntry(id: string): void {
    const naturalIndex = this.getNaturalIndex(id);
    if (naturalIndex === -1) return;

    const playbackIndex = this.getPlaybackIndex(naturalIndex);

    // If we're removing the current track, advance to the next track first
    if (this.state.currentEntryId === id) {
      // Temporarily mark the current track as something else so advance doesn't try to push the removed track to history yet.
      // Actually, advancing pushes current to history. If the user removes the current track,
      // does it go to history? Usually no, but let's just advance and NOT put it in history.
      const nextPlayback =
        playbackIndex + 1 < this.state.entries.length
          ? playbackIndex + 1
          : this.state.repeatMode === 'all'
            ? 0
            : -1;

      this.state.currentEntryId =
        nextPlayback !== -1
          ? this.state.entries[this.state.shufflePermutation[nextPlayback]].id
          : undefined;
    }

    // Remove from natural array
    this.state.entries.splice(naturalIndex, 1);

    // Remove from permutation and adjust remaining indices
    this.state.shufflePermutation.splice(playbackIndex, 1);
    this.state.shufflePermutation = this.state.shufflePermutation.map((idx) =>
      idx > naturalIndex ? idx - 1 : idx
    );
  }

  /**
   * Reorder an entry to a new physical (UI) position. If shuffle is off, this alters the natural
   * order. If shuffle is on, this only alters the playback order permutation.
   */
  public reorder(id: string, newPlaybackPosition: number): void {
    const naturalIndex = this.getNaturalIndex(id);
    if (naturalIndex === -1) return;

    const clampedNewPos = Math.max(0, Math.min(newPlaybackPosition, this.state.entries.length - 1));

    if (this.state.shuffleMode) {
      const currentPlaybackPos = this.getPlaybackIndex(naturalIndex);
      // Remove from old playback position
      this.state.shufflePermutation.splice(currentPlaybackPos, 1);
      // Insert into new playback position
      this.state.shufflePermutation.splice(clampedNewPos, 0, naturalIndex);
    } else {
      // Alter natural order directly
      const [movedEntry] = this.state.entries.splice(naturalIndex, 1);
      this.state.entries.splice(clampedNewPos, 0, movedEntry);
      // Re-map permutation to identity since shuffle is off
      this.state.shufflePermutation = this.state.entries.map((_, i) => i);
    }
  }

  /** Clear the entire queue (except current track usually, but let's clear all). */
  public clear(): void {
    this.state.entries = [];
    this.state.shufflePermutation = [];
    this.state.currentEntryId = undefined;
    // history remains intact
  }

  /** Jump to a specific track in the queue. */
  public jumpTo(id: string): void {
    const naturalIndex = this.getNaturalIndex(id);
    if (naturalIndex === -1) return;

    // Push current to history if different
    if (this.state.currentEntryId && this.state.currentEntryId !== id) {
      this.state.history.push(this.state.currentEntryId);
    }

    this.state.currentEntryId = id;
  }

  /** Advance to the next track. */
  public advance(): void {
    if (this.state.entries.length === 0) return;

    if (this.state.repeatMode === 'one' && this.state.currentEntryId) {
      // history remains same, current stays same
      // push to history? Usually repeat one doesn't fill history with same song over and over, or does it?
      // Let's keep it simple: do nothing.
      return;
    }

    const currentNatural = this.state.currentEntryId
      ? this.getNaturalIndex(this.state.currentEntryId)
      : -1;
    let nextPlayback = 0;

    if (currentNatural !== -1 && this.state.currentEntryId) {
      this.state.history.push(this.state.currentEntryId);
      const currentPlayback = this.getPlaybackIndex(currentNatural);
      nextPlayback = currentPlayback + 1;
    }

    if (nextPlayback >= this.state.entries.length) {
      if (this.state.repeatMode === 'all') {
        nextPlayback = 0;
      } else {
        // End of queue
        this.state.currentEntryId = undefined;
        return;
      }
    }

    const nextNatural = this.state.shufflePermutation[nextPlayback];
    this.state.currentEntryId = this.state.entries[nextNatural].id;
  }

  /** Go back to the previous track (from history). */
  public goBack(): void {
    if (this.state.history.length === 0) {
      // If no history, maybe just restart current? We'll just no-op.
      return;
    }

    while (this.state.history.length > 0) {
      const previousId = this.state.history.pop()!;
      if (this.getNaturalIndex(previousId) !== -1) {
        this.state.currentEntryId = previousId;
        return;
      }
    }

    // If we exhausted history, do nothing
  }

  public setRepeatMode(mode: 'none' | 'one' | 'all'): void {
    this.state.repeatMode = mode;
  }

  /**
   * Toggles shuffle mode. Note: Disabling and immediately enabling shuffle generates a brand-new
   * order intentionally.
   */
  public toggleShuffle(): void {
    this.state.shuffleMode = !this.state.shuffleMode;

    if (this.state.shuffleMode) {
      this.recomputeShuffle();
    } else {
      // Restore natural order
      this.state.shufflePermutation = this.state.entries.map((_, i) => i);

      // If we are playing something, maybe we want to keep it playing.
      // Since natural order is restored, the playback index of current naturally jumps to its natural index.
      // This is expected.
    }
  }

  /** Generates a random permutation for shuffle. */
  private recomputeShuffle(): void {
    const len = this.state.entries.length;
    if (len === 0) return;

    const currentNatural = this.state.currentEntryId
      ? this.getNaturalIndex(this.state.currentEntryId)
      : -1;

    let indicesToShuffle: number[] = [];
    for (let i = 0; i < len; i++) {
      if (i !== currentNatural) indicesToShuffle.push(i);
    }

    // Fisher-Yates shuffle
    for (let i = indicesToShuffle.length - 1; i > 0; i--) {
      const j = Math.floor(this.randomizer() * (i + 1));
      [indicesToShuffle[i], indicesToShuffle[j]] = [indicesToShuffle[j], indicesToShuffle[i]];
    }

    if (currentNatural !== -1) {
      this.state.shufflePermutation = [currentNatural, ...indicesToShuffle];
    } else {
      this.state.shufflePermutation = indicesToShuffle;
    }
  }
}
