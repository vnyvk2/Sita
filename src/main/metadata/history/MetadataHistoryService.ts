import type { DBTransaction } from '../../db/db';

import { MetadataHistoryRepository } from './MetadataHistoryRepository';

export interface SongMetadataSnapshot {
  songId: number;
  path: string;
  title: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  isrc?: string;
  musicBrainzRecordingId?: string;
}

export interface MetadataHistorySnapshot {
  id: string;
  timestamp: number;
  description: string;
  albumTitle?: string;
  songIds?: number[];
  previousSongs: SongMetadataSnapshot[];
  updatedSongs: SongMetadataSnapshot[];
}

/**
 * Undo history for metadata operations.
 *
 * When constructed with a {@link MetadataHistoryRepository} the undo stack is
 * durably persisted: snapshots survive app restarts and crashes. The in-memory
 * stack mirrors the durable rows for synchronous `canUndo` checks; it is
 * lazily hydrated from storage on first async access.
 *
 * The redo stack remains intentionally memory-only.
 */
export class MetadataHistoryService {
  private readonly repository?: MetadataHistoryRepository;
  private readonly maxStackSize: number;
  private undoStack: MetadataHistorySnapshot[] = [];
  private readonly redoStack: MetadataHistorySnapshot[] = [];
  private hydrationPromise?: Promise<void>;

  constructor(repositoryOrMaxSize?: number | MetadataHistoryRepository, maxStackSize = 20) {
    if (typeof repositoryOrMaxSize === 'number') {
      this.maxStackSize = repositoryOrMaxSize;
    } else {
      this.repository = repositoryOrMaxSize;
      this.maxStackSize = maxStackSize;
    }
  }

  public async pushSnapshot(snapshot: MetadataHistorySnapshot): Promise<void> {
    // Durable-first: a crash between insert and mirror still leaves the row,
    // which is re-hydrated on next launch.
    if (this.repository) {
      await this.repository.insert(snapshot);
    }

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0; // Clear redo stack on new action
  }

  /**
   * P0 #3: durable-only journal insert inside a caller-owned DB transaction.
   * The orchestrator stages the undo row in the SAME transaction as the
   * mutation, then mirrors it into the memory stack via {@link adoptSnapshot}
   * only after the commit succeeded. A crash can therefore never produce
   * DB=new with undo=missing (and a rolled-back mutation never leaves a
   * phantom journal entry behind).
   */
  public async persistSnapshotInTransaction(
    snapshot: MetadataHistorySnapshot,
    trx: DBTransaction
  ): Promise<void> {
    if (!this.repository) return; // memory-only service: nothing durable to stage
    await this.repository.insert(snapshot, trx);
  }

  /**
   * P0 #2: grouped variant of {@link persistSnapshotInTransaction}. Appends one
   * song's snapshots to the operation's single journal row, creating the row on
   * first sight, so every committed song is journaled even when a later song
   * in the group fails.
   */
  public async appendToGroupSnapshotInTransaction(
    args: {
      id: string;
      description: string;
      albumTitle?: string;
      previousSong: MetadataHistorySnapshot['previousSongs'][number];
      updatedSong: MetadataHistorySnapshot['updatedSongs'][number];
    },
    trx: DBTransaction
  ): Promise<void> {
    if (!this.repository) return;
    await this.repository.appendToSnapshot(args, trx);
  }

  /** Memory-stack mirror of an already-committed durable snapshot. */
  public adoptSnapshot(snapshot: MetadataHistorySnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
  }

  /**
   * Returns the snapshot an undo would restore WITHOUT consuming it.
   * Callers must invoke {@link confirmUndo} only after the restore succeeded,
   * so a failed undo remains retryable.
   */
  public async peekUndo(targetSongId?: number): Promise<MetadataHistorySnapshot | undefined> {
    await this.hydrate();

    if (this.undoStack.length === 0) return undefined;

    if (targetSongId !== undefined) {
      const foundIdx = this.undoStack.findLastIndex(
        (snap) => snap.songIds?.includes(targetSongId) || snap.previousSongs.some((s) => s.songId === targetSongId)
      );
      return foundIdx !== -1 ? this.undoStack[foundIdx] : undefined;
    }

    return this.undoStack[this.undoStack.length - 1];
  }

  /** Removes a previously-peeked snapshot from the durable journal and stack. */
  public async confirmUndo(id: string): Promise<void> {
    if (this.repository) {
      await this.repository.deleteById(id);
    }

    const index = this.undoStack.findIndex((snap) => snap.id === id);
    if (index !== -1) {
      const [snapshot] = this.undoStack.splice(index, 1);
      if (snapshot) {
        this.redoStack.push(snapshot);
      }
    }
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public async clear(): Promise<void> {
    if (this.repository) {
      await this.repository.clearAll();
    }
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private hydrate(): Promise<void> {
    if (!this.repository || this.hydrationPromise) return this.hydrationPromise ?? Promise.resolve();

    this.hydrationPromise = (async () => {
      const rows = await this.repository!.listNewestFirst(this.maxStackSize);
      // rows are newest-first; the stack wants newest-last
      this.undoStack = rows.reverse();
    })();

    return this.hydrationPromise;
  }
}
