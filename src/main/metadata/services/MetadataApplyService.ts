import type { AlbumTagPreview, ApplyPreviewOptions, TrackMatchPreview } from '../../../common/metadata/types';
import type { MetadataHistorySnapshot, SongMetadataSnapshot } from '../history/MetadataHistoryService';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import { TagWriterService, type TagWritePayload } from './TagWriterService';

export class MetadataError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = 'MetadataError';
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

export class RollbackError extends MetadataError {
  constructor(message: string) {
    super(message, 'ROLLBACK_FAILED');
    this.name = 'RollbackError';
  }
}

export type SongDbUpdater = (
  songId: number,
  data: {
    title?: string;
    artist?: string;
    album?: string;
    genre?: string;
    year?: number;
    trackNumber?: number;
    discNumber?: number;
  }
) => Promise<unknown>;

export interface ApplyResult {
  success: boolean;
  updatedCount: number;
  deferredCount?: number;
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

  public get writer(): TagWriterService {
    return this.tagWriter;
  }

  public get updater(): SongDbUpdater | undefined {
    return this.dbUpdater;
  }

  /**
   * Applies metadata changes from AlbumTagPreview using chunked batched transactions with AbortSignal cancellation support:
   * Chunking (default 50 items/batch) -> Check Cancellation -> Validate -> Snapshot -> Disk Write -> DB Transaction & ReParse -> Revert Disk on Error
   */
  public async applyPreview(
    preview: AlbumTagPreview,
    options?: ApplyPreviewOptions,
    signal?: AbortSignal
  ): Promise<ApplyResult> {
    if (!preview || !preview.matches || preview.matches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    const selectedMatches = preview.matches.filter((m) => m.applyTrack);
    if (selectedMatches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    // Step 0: Download and validate artwork buffer ONCE if replaceArtwork is requested
    let artworkBuffer: Buffer | undefined;
    if (options?.replaceArtwork) {
      const artUrl = options.artworkUrl || preview.album.artwork?.primaryPath || preview.album.artwork?.onlineUrls?.[0];
      if (artUrl) {
        artworkBuffer = await this.fetchAndValidateArtwork(artUrl, signal);
      }
    }

    let totalUpdated = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    // Split selected matches into chunks of batchChunkSize (default 50)
    for (let i = 0; i < selectedMatches.length; i += this.batchChunkSize) {
      if (signal?.aborted) {
        throw new CancelledError('Apply operation aborted by user.');
      }

      const chunkMatches = selectedMatches.slice(i, i + this.batchChunkSize);
      const chunkResult = await this.applyMatchChunk(chunkMatches, preview.album.title, artworkBuffer, signal);

      totalUpdated += chunkResult.updatedCount;
      totalFailed += chunkResult.failedCount;
      errors.push(...chunkResult.errors);

      if (!chunkResult.success) {
        break; // Stop remaining chunks if a batch transaction fails
      }
    }

    if (totalFailed === 0 && totalUpdated > 0) {
      // Target invalidation for song and album artwork caches
      try {
        const { resetArtworkCache } = await import('../../fs/resolveFilePaths');
        resetArtworkCache('songArtworks');
        resetArtworkCache('albumArtworks');
      } catch {
        // Ignored in isolated testing environments
      }
    }

    return {
      success: totalFailed === 0,
      updatedCount: totalUpdated,
      failedCount: totalFailed,
      errors
    };
  }

  private async fetchAndValidateArtwork(urlOrPath: string, signal?: AbortSignal): Promise<Buffer | undefined> {
    try {
      if (urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://')) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        if (signal) {
          if (signal.aborted) controller.abort();
          else signal.addEventListener('abort', () => controller.abort(), { once: true });
        }

        const res = await fetch(urlOrPath, { signal: controller.signal });
        clearTimeout(timeoutId);

        const contentType = res.headers?.get ? (res.headers.get('content-type') || '') : '';
        if (res.ok && (!contentType || contentType.includes('image/'))) {
          const arr = await res.arrayBuffer();
          const buf = Buffer.from(arr);
          // 8MB limit for cover art download
          if (buf.length > 0 && buf.length <= 8 * 1024 * 1024) {
            return buf;
          }
        }
      } else {
        const { readFile } = await import('fs/promises');
        const buf = await readFile(urlOrPath);
        if (buf.length > 0 && buf.length <= 8 * 1024 * 1024) return buf;
      }
    } catch (err) {
      console.warn(`[MetadataApplyService] Failed to download artwork from ${urlOrPath}:`, err);
    }
    return undefined;
  }

  private async applyMatchChunk(
    chunkMatches: TrackMatchPreview[],
    albumTitle: string,
    artworkBuffer?: Buffer,
    signal?: AbortSignal
  ): Promise<ApplyResult> {
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
        isrc: match.oldIsrc,
        musicBrainzRecordingId: match.oldMbid
      };
      previousSongs.push(previousSnapshot);

      const payloadTags: Partial<TagWritePayload> = {
        filePath: match.songPath,
        artworkBuffer
      };

      const updatedSnapshot: SongMetadataSnapshot = {
        ...previousSnapshot
      };

      for (const diff of match.fieldDiffs) {
        if (!diff.applyField) continue;
        const val = diff.userValue !== undefined ? diff.userValue : diff.suggestedValue;
        if (val === undefined || val === null || String(val).trim() === '') continue;

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
          case 'discNumber':
            payloadTags.discNumber = Number(val);
            updatedSnapshot.discNumber = Number(val);
            break;
          case 'genre':
            payloadTags.genre = String(val);
            updatedSnapshot.genre = String(val);
            break;
        }
      }

      tagWritePayloads.push(payloadTags as TagWritePayload);
      updatedSongs.push(updatedSnapshot);

      // Complete rollback payload restoring ALL metadata fields
      rollbackPayloads.push({
        filePath: match.songPath,
        title: match.oldTitle,
        artist: match.oldArtist,
        album: match.oldAlbum,
        year: match.oldYear,
        trackNumber: match.oldTrackNumber,
        discNumber: match.oldDiscNumber,
        genre: match.oldGenre,
        isrc: match.oldIsrc,
        musicBrainzRecordingId: match.oldMbid
      });
    }

    if (signal?.aborted) {
      throw new CancelledError('Apply operation aborted by user prior to file write.');
    }

    // Step 1: Write Physical Disk Tags
    const tagWriteResults = await this.tagWriter.writeBatch(tagWritePayloads);
    const failedWriteIndex = tagWriteResults.findIndex((r) => !r.success);

    if (failedWriteIndex !== -1) {
      // Roll back any files that were successfully written before the failure
      if (failedWriteIndex > 0) {
        const successfulRollbacks = rollbackPayloads.slice(0, failedWriteIndex);
        const rollbackResults = await this.tagWriter.writeBatch(successfulRollbacks);
        const failedRollbacks = rollbackResults.filter((r) => !r.success);
        const rollbackErrors = failedRollbacks.map((f) => `Rollback failed for ${f.filePath}: ${f.error}`);
        if (rollbackErrors.length > 0) {
          return {
            success: false,
            updatedCount: 0,
            failedCount: chunkMatches.length,
            errors: [
              `Physical file tag write failed for ${tagWriteResults[failedWriteIndex].filePath}: ${tagWriteResults[failedWriteIndex].error}`,
              ...rollbackErrors
            ]
          };
        }
      }

      return {
        success: false,
        updatedCount: 0,
        failedCount: chunkMatches.length,
        errors: [`Physical file tag write failed for ${tagWriteResults[failedWriteIndex].filePath}: ${tagWriteResults[failedWriteIndex].error}`]
      };
    }

    if (signal?.aborted) {
      // Revert disk tags immediately if cancelled right after file write
      await this.tagWriter.writeBatch(rollbackPayloads);
      throw new CancelledError('Apply operation aborted by user, reverted physical file tags.');
    }

    // Step 2: Database Atomic Commit & Relational Re-parsing
    let updatedCount = 0;
    let failedCount = 0;

    try {
      if (this.dbUpdater) {
        for (const snap of updatedSongs) {
          await this.dbUpdater(snap.songId, {
            title: snap.title,
            artist: snap.artist,
            album: snap.album,
            genre: snap.genre,
            year: snap.year,
            trackNumber: snap.trackNumber,
            discNumber: snap.discNumber
          });
        }
      } else {
        // Module resolution check separated from execution
        let reParseSongModule: ((path: string) => Promise<unknown>) | undefined;
        try {
          reParseSongModule = (await import('../../parseSong/reParseSong')).default;
        } catch {
          reParseSongModule = undefined;
        }

        if (reParseSongModule) {
          for (const snap of updatedSongs) {
            await reParseSongModule(snap.path);
          }
        } else {
          // Direct DB query fallback ONLY if module cannot be resolved (e.g. isolated test runner)
          const { db } = await import('../../db/db');
          const { songs } = await import('../../db/schema');
          const { eq } = await import('drizzle-orm');

          const { getSongById } = await import('../../db/queries/songs');
          const { convertToSongData } = await import('../../utils/convert');
          const {
            removeDeletedArtistDataOfSong,
            removeDeletedAlbumDataOfSong,
            removeDeletedGenreDataOfSong
          } = await import('../../removeSongsFromLibrary');

          const manageArtistsOfParsedSong = (await import('../../parseSong/manageArtistsOfParsedSong')).default;
          const manageAlbumsOfParsedSong = (await import('../../parseSong/manageAlbumsOfParsedSong')).default;
          const manageGenresOfParsedSong = (await import('../../parseSong/manageGenresOfParsedSong')).default;

          await db.transaction(async (trx) => {
            for (const snap of updatedSongs) {
              const prevSongData = await getSongById(snap.songId, trx);
              if (prevSongData) {
                const prevSong = convertToSongData(prevSongData);
                await removeDeletedArtistDataOfSong(prevSong, trx);
                await removeDeletedAlbumDataOfSong(prevSong, trx);
                await removeDeletedGenreDataOfSong(prevSong, trx);
              }

              // 1. Update scalar fields
              await trx
                .update(songs)
                .set({
                  title: snap.title,
                  year: snap.year,
                  trackNumber: snap.trackNumber,
                  diskNumber: snap.discNumber,
                  updatedAt: new Date()
                })
                .where(eq(songs.id, snap.songId));

              // 2. Update relational metadata
              if (snap.artist) {
                await manageArtistsOfParsedSong({ songId: snap.songId, songArtists: [snap.artist] }, trx);
              }
              if (snap.album) {
                await manageAlbumsOfParsedSong(
                  {
                    songId: snap.songId,
                    artists: snap.artist ? [snap.artist] : [],
                    albumArtists: snap.artist ? [snap.artist] : [],
                    albumName: snap.album,
                    songYear: snap.year
                  },
                  trx
                );
              }
              if (snap.genre) {
                await manageGenresOfParsedSong({ songId: snap.songId, songGenres: [snap.genre] }, trx);
              }
            }
          });
        }
      }

      updatedCount = updatedSongs.length;

      const historySnapshot: MetadataHistorySnapshot = {
        id: `snap_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        timestamp: Date.now(),
        description: `AutoTag applied for ${albumTitle}`,
        albumTitle,
        songIds: updatedSongs.map((s) => s.songId),
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
      discNumber: s.discNumber,
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
            artist: snap.artist,
            album: snap.album,
            genre: snap.genre,
            year: snap.year,
            trackNumber: snap.trackNumber,
            discNumber: snap.discNumber
          });
        }
      } else {
        let reParseSongModule: ((path: string) => Promise<unknown>) | undefined;
        try {
          reParseSongModule = (await import('../../parseSong/reParseSong')).default;
        } catch {
          reParseSongModule = undefined;
        }

        if (reParseSongModule) {
          for (const snap of snapshot.previousSongs) {
            await reParseSongModule(snap.path);
          }
        } else {
          const { db } = await import('../../db/db');
          const { songs } = await import('../../db/schema');
          const { eq } = await import('drizzle-orm');

          const { getSongById } = await import('../../db/queries/songs');
          const { convertToSongData } = await import('../../utils/convert');
          const {
            removeDeletedArtistDataOfSong,
            removeDeletedAlbumDataOfSong,
            removeDeletedGenreDataOfSong
          } = await import('../../removeSongsFromLibrary');

          const manageArtistsOfParsedSong = (await import('../../parseSong/manageArtistsOfParsedSong')).default;
          const manageAlbumsOfParsedSong = (await import('../../parseSong/manageAlbumsOfParsedSong')).default;
          const manageGenresOfParsedSong = (await import('../../parseSong/manageGenresOfParsedSong')).default;

          await db.transaction(async (trx) => {
            for (const snap of snapshot.previousSongs) {
              const prevSongData = await getSongById(snap.songId, trx);
              if (prevSongData) {
                const prevSong = convertToSongData(prevSongData);
                await removeDeletedArtistDataOfSong(prevSong, trx);
                await removeDeletedAlbumDataOfSong(prevSong, trx);
                await removeDeletedGenreDataOfSong(prevSong, trx);
              }

              await trx
                .update(songs)
                .set({
                  title: snap.title,
                  year: snap.year,
                  trackNumber: snap.trackNumber,
                  diskNumber: snap.discNumber,
                  updatedAt: new Date()
                })
                .where(eq(songs.id, snap.songId));

              if (snap.artist) {
                await manageArtistsOfParsedSong({ songId: snap.songId, songArtists: [snap.artist] }, trx);
              }
              if (snap.album) {
                await manageAlbumsOfParsedSong(
                  {
                    songId: snap.songId,
                    artists: snap.artist ? [snap.artist] : [],
                    albumArtists: snap.artist ? [snap.artist] : [],
                    albumName: snap.album,
                    songYear: snap.year
                  },
                  trx
                );
              }
              if (snap.genre) {
                await manageGenresOfParsedSong({ songId: snap.songId, songGenres: [snap.genre] }, trx);
              }
            }
          });
        }
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
