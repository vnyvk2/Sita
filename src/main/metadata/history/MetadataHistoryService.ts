export interface SongMetadataSnapshot {
  songId: number;
  path: string;
  title: string;
  artist?: string;
  album?: string;
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

export class MetadataHistoryService {
  private readonly undoStack: MetadataHistorySnapshot[] = [];
  private readonly redoStack: MetadataHistorySnapshot[] = [];
  private readonly maxStackSize: number;

  constructor(maxStackSize = 20) {
    this.maxStackSize = maxStackSize;
  }

  public pushSnapshot(snapshot: MetadataHistorySnapshot): void {
    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0; // Clear redo stack on new action
  }

  public popUndo(targetSongId?: number): MetadataHistorySnapshot | undefined {
    if (this.undoStack.length === 0) return undefined;

    let index = this.undoStack.length - 1;
    if (targetSongId !== undefined) {
      const foundIdx = this.undoStack.findLastIndex(
        (snap) => snap.songIds?.includes(targetSongId) || snap.previousSongs.some((s) => s.songId === targetSongId)
      );
      if (foundIdx !== -1) index = foundIdx;
    }

    const [snapshot] = this.undoStack.splice(index, 1);
    if (snapshot) {
      this.redoStack.push(snapshot);
    }
    return snapshot;
  }

  public popRedo(): MetadataHistorySnapshot | undefined {
    const snapshot = this.redoStack.pop();
    if (snapshot) {
      this.undoStack.push(snapshot);
    }
    return snapshot;
  }

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
