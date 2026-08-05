import type { AlbumTagPreview } from '../models/AlbumTagPreview';
import type { MetadataHistorySnapshot, SongMetadataSnapshot } from '../history/MetadataHistoryService';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import { TagWriterService, type TagWritePayload } from './TagWriterService';

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
   * Applies metadata changes from AlbumTagPreview inside a safe transaction flow:
   * Validate -> Snapshot -> Write Disk Tags -> Update SQLite DB -> Return ApplyResult
   */
  public async applyPreview(preview: AlbumTagPreview): Promise<ApplyResult> {
    if (!preview || !preview.matches || preview.matches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    const tracksToApply = preview.matches.filter((m) => m.applyTrack);
    if (tracksToApply.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    // 1. Build snapshots for Undo History
    const previousSnapshots: SongMetadataSnapshot[] = [];
    const updatedSnapshots: SongMetadataSnapshot[] = [];
    const tagPayloads: TagWritePayload[] = [];

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
    this.historyService.pushSnapshot(historySnapshot);

    // 4. Update Database Metadata
    let updatedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const snap of updatedSnapshots) {
      try {
        if (this.dbUpdater) {
          await this.dbUpdater(snap.songId, {
            title: snap.title,
            year: snap.year,
            trackNumber: snap.trackNumber
          });
        } else {
          const { updateSongBasicFields } = await import('../../db/queries/songs');
          await updateSongBasicFields(snap.songId, {
            title: snap.title,
            year: snap.year,
            trackNumber: snap.trackNumber
          });
        }
        updatedCount++;
      } catch (err: unknown) {
        failedCount++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`Failed DB update for song ${snap.songId}: ${msg}`);
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
   * Undoes the last AutoTag transaction restoring original song metadata.
   */
  public async undoLastAutoTag(): Promise<{ success: boolean; restoredCount: number }> {
    const snapshot = this.historyService.popUndo();
    if (!snapshot) {
      return { success: false, restoredCount: 0 };
    }

    let restoredCount = 0;
    for (const prev of snapshot.previousSongs) {
      if (this.dbUpdater) {
        await this.dbUpdater(prev.songId, {
          title: prev.title,
          year: prev.year,
          trackNumber: prev.trackNumber
        });
      } else {
        const { updateSongBasicFields } = await import('../../db/queries/songs');
        await updateSongBasicFields(prev.songId, {
          title: prev.title,
          year: prev.year,
          trackNumber: prev.trackNumber
        });
      }
      restoredCount++;
    }

    return { success: true, restoredCount };
  }
}
