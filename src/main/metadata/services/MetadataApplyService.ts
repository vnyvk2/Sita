import type { AlbumTagPreview } from '../models/AlbumTagPreview';
import type { MetadataHistorySnapshot, SongMetadataSnapshot } from '../history/MetadataHistoryService';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import { TagWriterService, type TagWritePayload } from './TagWriterService';

/**
 * Optional database updater function injection.
 * NOTE: Primarily intended for unit testing dependency injection. If supplied in production,
 * the caller must ensure its own transactional rollback semantics.
 */
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
}

export class MetadataApplyService {
  private readonly tagWriter: TagWriterService;
  private readonly historyService: MetadataHistoryService;
  private readonly dbUpdater?: SongDbUpdater;

  constructor(options?: MetadataApplyServiceOptions) {
    this.tagWriter = options?.tagWriter ?? new TagWriterService();
    this.historyService = options?.historyService ?? new MetadataHistoryService();
    this.dbUpdater = options?.dbUpdater;
  }

  public get history(): MetadataHistoryService {
    return this.historyService;
  }

  /**
   * Applies metadata changes from AlbumTagPreview using a best-effort coordinated update with rollback:
   * Validate -> Snapshot -> Write Disk Tags -> Update SQLite DB (Atomic Transaction) -> Rollback File Tags on Failure
   */
  public async applyPreview(preview: AlbumTagPreview): Promise<ApplyResult> {
    if (!preview || !preview.matches || preview.matches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    const tracksToApply = preview.matches.filter((m) => m.applyTrack);
    if (tracksToApply.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    // 1. Build snapshots for Undo History & Rollback
    const previousSnapshots: SongMetadataSnapshot[] = [];
    const updatedSnapshots: SongMetadataSnapshot[] = [];
    const tagPayloads: TagWritePayload[] = [];
    const rollbackPayloads: TagWritePayload[] = [];

    for (const track of tracksToApply) {
      previousSnapshots.push({
        songId: track.localSongId,
        path: track.songPath,
        title: track.oldTitle,
        artist: track.oldArtist,
        album: track.oldAlbum,
        year: track.oldYear,
        trackNumber: track.oldTrackNumber,
        discNumber: track.oldDiscNumber,
        genre: track.oldGenre,
        isrc: track.oldIsrc,
        musicBrainzRecordingId: track.oldMbid
      });

      rollbackPayloads.push({
        filePath: track.songPath,
        title: track.oldTitle,
        artist: track.oldArtist,
        album: track.oldAlbum,
        year: track.oldYear,
        trackNumber: track.oldTrackNumber,
        discNumber: track.oldDiscNumber,
        genre: track.oldGenre,
        isrc: track.oldIsrc,
        musicBrainzRecordingId: track.oldMbid
      });

      // Compute effective new values per field diff toggle
      const getEffectiveValue = <T>(fieldId: string, fallback: T): T => {
        const diff = track.fieldDiffs.find((f) => f.fieldId === fieldId);
        if (diff && diff.applyField) {
          return (diff.userValue ?? diff.suggestedValue ?? fallback) as T;
        }
        return fallback;
      };

      const newTitle = getEffectiveValue('title', track.oldTitle);
      const newArtist = getEffectiveValue('artist', track.oldArtist);
      const newAlbum = getEffectiveValue('album', track.oldAlbum);
      const newYear = getEffectiveValue('year', track.oldYear);
      const newTrackNo = getEffectiveValue('trackNumber', track.oldTrackNumber);
      const newDiscNo = getEffectiveValue('discNumber', track.oldDiscNumber);
      const newGenre = getEffectiveValue('genre', track.oldGenre);
      const newIsrc = getEffectiveValue('isrc', track.oldIsrc);
      const newMbid = getEffectiveValue('musicBrainzRecordingId', track.oldMbid);

      updatedSnapshots.push({
        songId: track.localSongId,
        path: track.songPath,
        title: newTitle,
        artist: newArtist,
        album: newAlbum,
        year: newYear,
        trackNumber: newTrackNo,
        discNumber: newDiscNo,
        genre: newGenre,
        isrc: newIsrc,
        musicBrainzRecordingId: newMbid
      });

      tagPayloads.push({
        filePath: track.songPath,
        title: newTitle,
        artist: newArtist,
        album: newAlbum,
        year: newYear,
        trackNumber: newTrackNo,
        discNumber: newDiscNo,
        genre: newGenre,
        isrc: newIsrc,
        musicBrainzRecordingId: newMbid
      });
    }

    // 2. Write Physical File Tags on Disk
    const writeResults = await this.tagWriter.writeBatch(tagPayloads);
    const failedWrites = writeResults.filter((r) => !r.success);

    if (failedWrites.length > 0) {
      const errors = failedWrites.map((f) => `Failed tag write for ${f.filePath}: ${f.error}`);
      return { success: false, updatedCount: 0, failedCount: failedWrites.length, errors };
    }

    // 3. Save History Snapshot before DB mutation
    const historySnapshot: MetadataHistorySnapshot = {
      id: `snapshot_${Date.now()}`,
      timestamp: Date.now(),
      description: `AutoTag ${preview.album.title} (${tracksToApply.length} songs)`,
      previousSongs: previousSnapshots,
      updatedSongs: updatedSnapshots
    };

    // 4. Update Database Metadata with Coordinated Rollback Guard
    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      if (this.dbUpdater) {
        for (const snap of updatedSnapshots) {
          await this.dbUpdater(snap.songId, {
            title: snap.title,
            year: snap.year,
            trackNumber: snap.trackNumber
          });
          updatedCount++;
        }
      } else {
        const { db } = await import('../../db/db');
        const { updateSongBasicFields } = await import('../../db/queries/songs');

        await db.transaction(async (trx) => {
          for (const snap of updatedSnapshots) {
            await updateSongBasicFields(
              snap.songId,
              {
                title: snap.title,
                year: snap.year,
                trackNumber: snap.trackNumber
              },
              trx
            );
            updatedCount++;
          }
        });
      }

      this.historyService.pushSnapshot(historySnapshot);
    } catch (err: unknown) {
      // ROLLBACK PHYSICAL DISK TAGS ON DB TRANSACTION FAILURE & VERIFY ROLLBACK
      const rollbackResults = await this.tagWriter.writeBatch(rollbackPayloads);
      const failedRollbacks = rollbackResults.filter((r) => !r.success);

      failedCount = updatedSnapshots.length;
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

  /**
   * Undoes the last AutoTag transaction restoring BOTH physical file tags AND database records.
   * Verifies tag write results to report failures accurately.
   */
  public async undoLastAutoTag(): Promise<{ success: boolean; restoredCount: number; errors?: string[] }> {
    const snapshot = this.historyService.popUndo();
    if (!snapshot) {
      return { success: false, restoredCount: 0 };
    }

    // 1. Restore Physical Tags on Disk & Verify
    const rollbackPayloads: TagWritePayload[] = snapshot.previousSongs.map((prev) => ({
      filePath: prev.path,
      title: prev.title,
      artist: prev.artist,
      album: prev.album,
      year: prev.year,
      trackNumber: prev.trackNumber,
      discNumber: prev.discNumber,
      genre: prev.genre,
      isrc: prev.isrc,
      musicBrainzRecordingId: prev.musicBrainzRecordingId
    }));

    const tagResults = await this.tagWriter.writeBatch(rollbackPayloads);
    const failedTagWrites = tagResults.filter((r) => !r.success);

    // 2. Restore SQLite Database Records
    let restoredCount = 0;
    if (this.dbUpdater) {
      for (const prev of snapshot.previousSongs) {
        await this.dbUpdater(prev.songId, {
          title: prev.title,
          year: prev.year,
          trackNumber: prev.trackNumber
        });
        restoredCount++;
      }
    } else {
      const { db } = await import('../../db/db');
      const { updateSongBasicFields } = await import('../../db/queries/songs');

      await db.transaction(async (trx) => {
        for (const prev of snapshot.previousSongs) {
          await updateSongBasicFields(
            prev.songId,
            {
              title: prev.title,
              year: prev.year,
              trackNumber: prev.trackNumber
            },
            trx
          );
          restoredCount++;
        }
      });
    }

    if (failedTagWrites.length > 0) {
      const errors = failedTagWrites.map((f) => `Failed tag restoration for ${f.filePath}: ${f.error}`);
      return { success: false, restoredCount, errors };
    }

    return { success: true, restoredCount };
  }
}
