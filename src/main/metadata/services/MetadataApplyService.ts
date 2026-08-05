import type { AlbumTagPreview } from '../../../common/metadata/types';
import type { MetadataHistorySnapshot, SongMetadataSnapshot } from '../history/MetadataHistoryService';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import { TagWriterService, type TagWritePayload } from './TagWriterService';

export class MetadataError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MetadataError';
  }
}

export class NetworkError extends MetadataError {
  constructor(message: string) {
    super(message, 'NETWORK_ERROR');
    this.name = 'NetworkError';
  }
}

export class RateLimitError extends MetadataError {
  constructor(message: string) {
    super(message, 'RATE_LIMIT_ERROR');
    this.name = 'RateLimitError';
  }
}

export class PermissionError extends MetadataError {
  constructor(message: string) {
    super(message, 'PERMISSION_DENIED');
    this.name = 'PermissionError';
  }
}

export class WriteError extends MetadataError {
  constructor(message: string) {
    super(message, 'WRITE_ERROR');
    this.name = 'WriteError';
  }
}

export class CancelledError extends MetadataError {
  constructor(message: string) {
    super(message, 'CANCELLED');
    this.name = 'CancelledError';
  }
}

export type SongDbUpdater = (
  songId: number,
  data: { title?: string; year?: number; trackNumber?: number }
) => Promise<unknown>;

export interface ApplyResult {
  success: boolean;
  updatedCount: number;
  failedCount: number;
  errors: string[];
}

export interface MetadataApplyServiceOptions {
  tagWriter?: TagWriterService;
  historyService?: MetadataHistoryService;
  dbUpdater?: SongDbUpdater;
  batchChunkSize?: number;
}

export class MetadataApplyService {
  private readonly tagWriter: TagWriterService;
  private readonly historyService: MetadataHistoryService;
  private readonly dbUpdater?: SongDbUpdater;
  private readonly batchChunkSize: number;

  constructor(options?: MetadataApplyServiceOptions) {
    this.tagWriter = options?.tagWriter ?? new TagWriterService();
    this.historyService = options?.historyService ?? new MetadataHistoryService();
    this.dbUpdater = options?.dbUpdater;
    this.batchChunkSize = options?.batchChunkSize ?? 50;
  }

  public get history(): MetadataHistoryService {
    return this.historyService;
  }

  /**
   * Applies metadata changes from AlbumTagPreview using chunked batched transactions:
   * Chunking (default 50 items/batch) -> Validate -> Snapshot -> Disk Write -> DB Transaction -> Revert Disk on Error
   */
  public async applyPreview(preview: AlbumTagPreview): Promise<ApplyResult> {
    if (!preview || !preview.matches || preview.matches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    const selectedMatches = preview.matches.filter((m) => m.applyTrack);
    if (selectedMatches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    let totalUpdated = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    // Split selected matches into chunks of batchChunkSize (default 50)
    for (let i = 0; i < selectedMatches.length; i += this.batchChunkSize) {
      const chunkMatches = selectedMatches.slice(i, i + this.batchChunkSize);
      const chunkResult = await this.applyMatchChunk(chunkMatches, preview.album.title);

      totalUpdated += chunkResult.updatedCount;
      totalFailed += chunkResult.failedCount;
      errors.push(...chunkResult.errors);

      if (!chunkResult.success) {
        break; // Stop remaining chunks if a batch transaction fails
      }
    }

    return {
      success: totalFailed === 0,
      updatedCount: totalUpdated,
      failedCount: totalFailed,
      errors
    };
  }

  private async applyMatchChunk(chunkMatches: any[], albumTitle: string): Promise<ApplyResult> {
    const previousSongs: SongMetadataSnapshot[] = [];
    const updatedSongs: SongMetadataSnapshot[] = [];
    const tagWritePayloads: TagWritePayload[] = [];
    const rollbackPayloads: TagWritePayload[] = [];
    const errors: string[] = [];

    for (const match of chunkMatches) {
      const previousSnapshot: SongMetadataSnapshot = {
        songId: match.localSongId,
        path: match.songPath,
        title: match.oldTitle,
        artist: match.oldArtist,
        album: match.oldAlbum,
        year: match.oldYear,
        trackNumber: match.oldTrackNumber,
        discNumber: match.oldDiscNumber,
        genre: match.oldGenre,
        isrc: match.oldIsrc
      };
      previousSongs.push(previousSnapshot);

      const payloadTags: Partial<TagWritePayload> = {
        filePath: match.songPath,
        album: albumTitle
      };

      const updatedSnapshot: SongMetadataSnapshot = {
        ...previousSnapshot,
        album: albumTitle
      };

      for (const diff of match.fieldDiffs) {
        if (!diff.applyField) continue;
        const val = diff.userValue !== undefined ? diff.userValue : diff.suggestedValue;
        if (val === undefined || val === null) continue;

        switch (diff.fieldId) {
          case 'title':
            payloadTags.title = String(val);
            updatedSnapshot.title = String(val);
            break;
          case 'artist':
            payloadTags.artist = String(val);
            updatedSnapshot.artist = String(val);
            break;
          case 'album':
            payloadTags.album = String(val);
            updatedSnapshot.album = String(val);
            break;
          case 'year':
            payloadTags.year = Number(val);
            updatedSnapshot.year = Number(val);
            break;
          case 'trackNumber':
            payloadTags.trackNumber = Number(val);
            updatedSnapshot.trackNumber = Number(val);
            break;
          case 'genre':
            payloadTags.genre = String(val);
            updatedSnapshot.genre = String(val);
            break;
        }
      }

      tagWritePayloads.push(payloadTags as TagWritePayload);
      updatedSongs.push(updatedSnapshot);

      rollbackPayloads.push({
        filePath: match.songPath,
        title: match.oldTitle,
        artist: match.oldArtist,
        album: match.oldAlbum,
        year: match.oldYear,
        trackNumber: match.oldTrackNumber,
        genre: match.oldGenre
      });
    }

    // Step 1: Write Physical Disk Tags
    const tagWriteResults = await this.tagWriter.writeBatch(tagWritePayloads);
    const failedWrite = tagWriteResults.find((r) => !r.success);

    if (failedWrite) {
      return {
        success: false,
        updatedCount: 0,
        failedCount: chunkMatches.length,
        errors: [`Physical file tag write failed for ${failedWrite.filePath}: ${failedWrite.error}`]
      };
    }

    // Step 2: Database Atomic Commit
    let updatedCount = 0;
    let failedCount = 0;

    try {
      if (this.dbUpdater) {
        for (const snap of updatedSongs) {
          await this.dbUpdater(snap.songId, {
            title: snap.title,
            year: snap.year,
            trackNumber: snap.trackNumber
          });
        }
      } else {
        const { getDb } = await import('../../db');
        const db = getDb();

        await db.transaction(async (trx) => {
          for (const snap of updatedSongs) {
            await trx('songs')
              .where('songId', snap.songId)
              .update({
                title: snap.title,
                year: snap.year,
                trackNumber: snap.trackNumber,
                updatedAt: new Date()
              });
          }
        });
      }

      updatedCount = updatedSongs.length;

      const historySnapshot: MetadataHistorySnapshot = {
        id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        description: `AutoTag applied for ${albumTitle}`,
        previousSongs,
        updatedSongs
      };

      this.historyService.pushSnapshot(historySnapshot);
    } catch (err: unknown) {
      const rollbackResults = await this.tagWriter.writeBatch(rollbackPayloads);
      const failedRollbacks = rollbackResults.filter((r) => !r.success);

      failedCount = updatedSongs.length;
      updatedCount = 0;
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`DB transaction failed, rolled back physical file tags: ${msg}`);

      if (failedRollbacks.length > 0) {
        for (const f of failedRollbacks) {
          errors.push(`Tag rollback failed for ${f.filePath}: ${f.error}`);
        }
      }
    }

    return {
      success: failedCount === 0,
      updatedCount,
      failedCount,
      errors
    };
  }

  public async undoLastAutoTag(): Promise<{ success: boolean; restoredCount: number; errors?: string[] }> {
    const snapshot = this.historyService.popUndo();
    if (!snapshot) {
      return { success: false, restoredCount: 0, errors: ['No AutoTag history available to undo'] };
    }

    const restorePayloads: TagWritePayload[] = snapshot.previousSongs.map((s) => ({
      filePath: s.path,
      title: s.title,
      artist: s.artist,
      album: s.album,
      year: s.year,
      trackNumber: s.trackNumber,
      genre: s.genre
    }));

    const tagWriteResults = await this.tagWriter.writeBatch(restorePayloads);
    const failedWrite = tagWriteResults.find((r) => !r.success);

    if (failedWrite) {
      return {
        success: false,
        restoredCount: 0,
        errors: [`Undo physical file tag restore failed for ${failedWrite.filePath}: ${failedWrite.error}`]
      };
    }

    try {
      if (this.dbUpdater) {
        for (const snap of snapshot.previousSongs) {
          await this.dbUpdater(snap.songId, {
            title: snap.title,
            year: snap.year,
            trackNumber: snap.trackNumber
          });
        }
      } else {
        const { getDb } = await import('../../db');
        const db = getDb();

        await db.transaction(async (trx) => {
          for (const snap of snapshot.previousSongs) {
            await trx('songs')
              .where('songId', snap.songId)
              .update({
                title: snap.title,
                year: snap.year,
                trackNumber: snap.trackNumber,
                updatedAt: new Date()
              });
          }
        });
      }

      return { success: true, restoredCount: snapshot.previousSongs.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        restoredCount: 0,
        errors: [`Undo DB transaction failed: ${msg}`]
      };
    }
  }
}
