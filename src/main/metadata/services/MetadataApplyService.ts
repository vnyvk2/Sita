import { randomUUID } from 'crypto';

import type {
  AlbumTagPreview,
  ApplyPreviewOptions,
  GlobalAlbumMutations,
  TrackMatchPreview
} from '../../../common/metadata/types';
import type {
  MetadataHistorySnapshot,
  SongMetadataSnapshot
} from '../history/MetadataHistoryService';
import { MetadataHistoryService } from '../history/MetadataHistoryService';
import { TagWriterService, type TagWritePayload } from './TagWriterService';

export class MetadataError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
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
    isrc?: string;
    musicBrainzRecordingId?: string;
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
  orchestrator?: import('../apply/MetadataApplyOrchestrator').MetadataApplyOrchestrator;
}

export class MetadataApplyService {
  private readonly tagWriter: TagWriterService;
  private readonly historyService: MetadataHistoryService;
  private readonly dbUpdater?: SongDbUpdater;
  private readonly orchestrator?: import('../apply/MetadataApplyOrchestrator').MetadataApplyOrchestrator;
  private readonly batchChunkSize: number;

  constructor(options?: MetadataApplyServiceOptions) {
    this.tagWriter = options?.tagWriter ?? new TagWriterService();
    this.historyService = options?.historyService ?? new MetadataHistoryService();
    this.dbUpdater = options?.dbUpdater;
    this.orchestrator = options?.orchestrator;
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
   * Applies metadata changes from AlbumTagPreview using chunked batched transactions with
   * AbortSignal cancellation support: Chunking (default 50 items/batch) -> Check Cancellation ->
   * Validate -> Snapshot -> Disk Write -> DB Transaction & ReParse -> Revert Disk on Error
   */
  public async applyPreview(
    preview: AlbumTagPreview,
    options?: ApplyPreviewOptions,
    signal?: AbortSignal
  ): Promise<ApplyResult> {
    if (!preview || !preview.matches || preview.matches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    // Defensive boundary: Exclude missing / non-local tracks from all disk and database operations
    const actionableMatches = preview.matches.filter(
      (m) => !m.isMissingLocally && m.localSongId !== undefined && m.localSongId > 0
    );

    if (actionableMatches.length === 0) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    const selectedMatches = actionableMatches.filter((m) => m.applyTrack);
    const globalMutations = options?.globalMutations;

    const hasGlobalMetadataChanges = Boolean(
      globalMutations &&
      (globalMutations.applyAlbumTitle ||
        globalMutations.applyAlbumArtist ||
        globalMutations.applyYear ||
        globalMutations.applyGenre)
    );
    const hasArtworkChange = Boolean(options?.replaceArtwork);
    const hasAlbumLevelChanges = hasGlobalMetadataChanges || hasArtworkChange;

    if (selectedMatches.length === 0 && !hasAlbumLevelChanges) {
      return { success: true, updatedCount: 0, failedCount: 0, errors: [] };
    }

    // Step 0: Download and validate artwork buffer ONCE if replaceArtwork is requested
    let artworkBuffer: Buffer | undefined;
    if (options?.replaceArtwork) {
      const artUrl =
        options.artworkUrl ||
        preview.album.artwork?.primaryPath ||
        preview.album.artwork?.onlineUrls?.[0];
      if (artUrl) {
        artworkBuffer = await this.fetchAndValidateArtwork(artUrl, signal);
      }
    }

    let totalUpdated = 0;
    let totalFailed = 0;
    const errors: string[] = [];

    // Target matches: If album-level mutations are active, all local album tracks receive album tags; otherwise only selected local tracks
    const targetMatches = hasAlbumLevelChanges ? actionableMatches : selectedMatches;

    // ── 2c P3 reroute: when an orchestrator is attached, AutoTag applies flow
    // through the single authoritative owner. The legacy chunk pipeline below
    // remains for direct unit tests constructed without one.
    if (this.orchestrator) {
      const opId = options?.operationId ?? `apply-${randomUUID()}`;
      const albumTitle = preview.album.title;
      const normalized = targetMatches.map((match) => {
        // Contract whitelist: unknown ids (e.g. artworkUrl) are excluded -
        // artwork travels through its own normalized channel.
        const KNOWN_APPLY_FIELDS: ReadonlySet<string> = new Set([
          'title',
          'artist',
          'album',
          'year',
          'trackNumber',
          'discNumber',
          'genre',
          'isrc',
          'musicBrainzRecordingId'
        ]);
        const fields: import('../apply/contract').NormalizedFieldMutation[] = (
          match.fieldDiffs ?? []
        )
          .filter((d) => d.applyField && KNOWN_APPLY_FIELDS.has(d.fieldId))
          .map((d) => {
            const val = d.userValue !== undefined ? d.userValue : d.suggestedValue;
            return {
              fieldId: d.fieldId as never,
              oldValue: d.oldValue ?? null,
              newValue: val as string | number
            };
          })
          .filter((f) => f.newValue !== undefined && String(f.newValue).trim() !== '');

        if (globalMutations?.applyAlbumTitle && globalMutations.albumTitle) {
          fields.push({
            fieldId: 'album',
            oldValue: match.oldAlbum ?? null,
            newValue: globalMutations.albumTitle
          });
        }
        if (globalMutations?.applyYear && globalMutations.year !== undefined) {
          fields.push({
            fieldId: 'year',
            oldValue: match.oldYear ?? null,
            newValue: globalMutations.year
          });
        }
        if (globalMutations?.applyGenre && globalMutations.genre) {
          fields.push({
            fieldId: 'genre',
            oldValue: match.oldGenre ?? null,
            newValue: globalMutations.genre
          });
        }

        return {
          mutationId: `${opId}:${match.localSongId}`,
          operationId: opId,
          songId: match.localSongId,
          filePath: match.songPath,
          fields,
          ...(globalMutations?.applyAlbumArtist && globalMutations.albumArtist
            ? { albumArtistNewValue: globalMutations.albumArtist }
            : {}),
          ...(artworkBuffer !== undefined && artworkBuffer !== null && artworkBuffer.length > 0
            ? { artwork: { buffer: artworkBuffer } }
            : {}),
          fileWrite: { deferredIfPlaying: true },
          undo: {
            description: `AutoTag applied for ${albumTitle}`,
            previousSongs: [
              {
                songId: match.localSongId,
                path: match.songPath,
                title: match.oldTitle,
                artist: match.oldArtist,
                albumArtist: match.oldAlbumArtist,
                album: match.oldAlbum,
                year: match.oldYear,
                trackNumber: match.oldTrackNumber,
                discNumber: match.oldDiscNumber,
                genre: match.oldGenre,
                isrc: match.oldIsrc,
                musicBrainzRecordingId: match.oldMbid
              }
            ]
          }
        };
      });

      const orchRes = await this.orchestrator.execute(normalized, {
        albumTitle,
        groupUndo: { description: `AutoTag applied for ${albumTitle}` }
      });

      if (orchRes.updatedCount > 0 || orchRes.deferredCount > 0) {
        try {
          const { resetArtworkCache } = await import('../../fs/resolveFilePaths');
          resetArtworkCache('songArtworks');
          resetArtworkCache('albumArtworks');
        } catch {
          // Ignored in isolated testing environments
        }
      }

      return {
        success: orchRes.success,
        updatedCount: orchRes.updatedCount,
        deferredCount: orchRes.deferredCount > 0 ? orchRes.deferredCount : undefined,
        failedCount: orchRes.failedCount,
        errors: orchRes.errors
      };
    }

    // Split target matches into chunks of batchChunkSize (default 50)
    for (let i = 0; i < targetMatches.length; i += this.batchChunkSize) {
      if (signal?.aborted) {
        throw new CancelledError('Apply operation aborted by user.');
      }

      const chunkMatches = targetMatches.slice(i, i + this.batchChunkSize);
      const chunkResult = await this.applyMatchChunk(
        chunkMatches,
        preview.album.title,
        artworkBuffer,
        signal,
        globalMutations
      );

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

  private async fetchAndValidateArtwork(
    urlOrPath: string,
    signal?: AbortSignal
  ): Promise<Buffer | undefined> {
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

        const contentType = res.headers?.get ? res.headers.get('content-type') || '' : '';
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
    signal?: AbortSignal,
    globalMutations?: GlobalAlbumMutations
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
        albumArtist: match.oldAlbumArtist,
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

      // 1. Apply independent Album-Level / Global Mutations
      if (globalMutations) {
        if (globalMutations.applyAlbumTitle && globalMutations.albumTitle) {
          payloadTags.album = globalMutations.albumTitle;
        }
        if (globalMutations.applyAlbumArtist && globalMutations.albumArtist) {
          payloadTags.albumArtist = globalMutations.albumArtist;
        }
        if (globalMutations.applyYear && globalMutations.year !== undefined) {
          payloadTags.year = globalMutations.year;
        }
        if (globalMutations.applyGenre && globalMutations.genre) {
          payloadTags.genre = globalMutations.genre;
        }
      }

      // Snapshot values are narrowed from the (nullable) tag payload so
      // SongMetadataSnapshot never receives null.
      const snapshotAlbum = typeof payloadTags.album === 'string' ? payloadTags.album : undefined;
      const snapshotAlbumArtist =
        typeof payloadTags.albumArtist === 'string' ? payloadTags.albumArtist : undefined;
      const snapshotYear = typeof payloadTags.year === 'number' ? payloadTags.year : undefined;
      const snapshotGenre = typeof payloadTags.genre === 'string' ? payloadTags.genre : undefined;

      const updatedSnapshot: SongMetadataSnapshot = {
        ...previousSnapshot,
        ...(snapshotAlbum !== undefined && { album: snapshotAlbum }),
        ...(snapshotAlbumArtist !== undefined && { albumArtist: snapshotAlbumArtist }),
        ...(snapshotYear !== undefined && { year: snapshotYear }),
        ...(snapshotGenre !== undefined && { genre: snapshotGenre })
      };

      // 2. Apply Track-Level Mutations ONLY if this track is selected (match.applyTrack === true)
      if (match.applyTrack) {
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
            case 'albumArtist':
              payloadTags.albumArtist = String(val);
              updatedSnapshot.albumArtist = String(val);
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
            case 'isrc':
              payloadTags.isrc = String(val);
              updatedSnapshot.isrc = String(val);
              break;
            case 'musicBrainzRecordingId':
              payloadTags.musicBrainzRecordingId = String(val);
              updatedSnapshot.musicBrainzRecordingId = String(val);
              break;
          }
        }
      }

      tagWritePayloads.push(payloadTags as TagWritePayload);
      updatedSongs.push(updatedSnapshot);

      // Complete rollback payload restoring ALL metadata fields.
      // Previously-absent values are normalized to explicit clears (null) so
      // TagWriterService removes the newly-written value instead of skipping it.
      rollbackPayloads.push({
        filePath: match.songPath,
        title: match.oldTitle ?? '',
        artist: match.oldArtist ?? null,
        albumArtist: match.oldAlbumArtist ?? null,
        album: match.oldAlbum ?? null,
        year: match.oldYear ?? null,
        trackNumber: match.oldTrackNumber ?? null,
        discNumber: match.oldDiscNumber ?? null,
        genre: match.oldGenre ?? null,
        isrc: match.oldIsrc ?? null,
        musicBrainzRecordingId: match.oldMbid ?? null
      });
    }

    if (signal?.aborted) {
      throw new CancelledError('Apply operation aborted by user prior to file write.');
    }

    // Step 1: Write Physical Disk Tags
    const tagWriteResults = await this.tagWriter.writeBatch(tagWritePayloads);
    const failedWriteIndex = tagWriteResults.findIndex((r) => !r.success);

    if (failedWriteIndex !== -1) {
      // Roll back all files that were successfully written during the batch
      const successfulRollbacks = rollbackPayloads.filter(
        (_, idx) => tagWriteResults[idx]?.success === true
      );
      if (successfulRollbacks.length > 0) {
        const rollbackResults = await this.tagWriter.writeBatch(successfulRollbacks);
        const failedRollbacks = rollbackResults.filter((r) => !r.success);
        const rollbackErrors = failedRollbacks.map(
          (f) => `Rollback failed for ${f.filePath}: ${f.error}`
        );
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
        errors: [
          `Physical file tag write failed for ${tagWriteResults[failedWriteIndex].filePath}: ${tagWriteResults[failedWriteIndex].error}`
        ]
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
            discNumber: snap.discNumber,
            isrc: snap.isrc,
            musicBrainzRecordingId: snap.musicBrainzRecordingId
          });
        }
      } else {
        // Direct DB atomic transaction
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

        const manageArtistsOfParsedSong = (
          await import('../../parseSong/manageArtistsOfParsedSong')
        ).default;
        const manageAlbumsOfParsedSong = (await import('../../parseSong/manageAlbumsOfParsedSong'))
          .default;
        const manageGenresOfParsedSong = (await import('../../parseSong/manageGenresOfParsedSong'))
          .default;
        const manageAlbumArtistOfParsedSong = (
          await import('../../parseSong/manageAlbumArtistOfParsedSong')
        ).default;

        await db.transaction(async (trx) => {
          for (const snap of updatedSongs) {
            const prevSongData = await getSongById(snap.songId, trx);
            if (prevSongData) {
              const prevSong = convertToSongData(prevSongData);
              await removeDeletedArtistDataOfSong(prevSong, trx);
              await removeDeletedAlbumDataOfSong(prevSong, trx);
              await removeDeletedGenreDataOfSong(prevSong, trx);
            }

            // 1. Update scalar fields (identity columns included so both file
            //    frames and DB rows move together in the same operation)
            await trx
              .update(songs)
              .set({
                title: snap.title,
                year: snap.year,
                trackNumber: snap.trackNumber,
                diskNumber: snap.discNumber,
                ...(snap.isrc !== undefined && { isrc: snap.isrc }),
                ...(snap.musicBrainzRecordingId !== undefined && {
                  musicBrainzRecordingId: snap.musicBrainzRecordingId
                }),
                updatedAt: new Date()
              })
              .where(eq(songs.id, snap.songId));

            // 2. Update relational metadata
            if (snap.artist) {
              await manageArtistsOfParsedSong(
                { songId: snap.songId, songArtists: [snap.artist] },
                trx
              );
            }
            if (snap.album) {
              const { relevantAlbum } = await manageAlbumsOfParsedSong(
                {
                  songId: snap.songId,
                  artists: snap.artist ? [snap.artist] : [],
                  // Release-level artist only - never derived from track artist.
                  // Legacy snapshots without albumArtist leave the junction untouched.
                  albumArtists: snap.albumArtist ? [snap.albumArtist] : [],
                  albumName: snap.album,
                  songYear: snap.year
                },
                trx
              );
              if (snap.albumArtist && relevantAlbum) {
                await manageAlbumArtistOfParsedSong(
                  { albumArtists: [snap.albumArtist], albumId: relevantAlbum.id },
                  trx
                );
              }
            }
            if (snap.genre) {
              await manageGenresOfParsedSong(
                { songId: snap.songId, songGenres: [snap.genre] },
                trx
              );
            }
          }
        });
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

      await this.historyService.pushSnapshot(historySnapshot);
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

  public async undoLastAutoTag(): Promise<{
    success: boolean;
    restoredCount: number;
    errors?: string[];
  }> {
    // Peek without consuming: the snapshot stays in the durable journal until
    // the restore fully succeeded, so a failed undo remains retryable.
    const snapshot = await this.historyService.peekUndo();
    if (!snapshot) {
      return { success: false, restoredCount: 0, errors: ['No AutoTag history available to undo'] };
    }

    // Value-complete restore payloads: absent fields become explicit clears so
    // the file returns to its exact pre-AutoTag state (including isrc/mbid,
    // which reParseSong would otherwise re-import from polluted tags).
    const restorePayloads: TagWritePayload[] = snapshot.previousSongs.map((s) => ({
      filePath: s.path,
      title: s.title ?? '',
      artist: s.artist ?? null,
      albumArtist: s.albumArtist ?? null,
      album: s.album ?? null,
      year: s.year ?? null,
      trackNumber: s.trackNumber ?? null,
      discNumber: s.discNumber ?? null,
      genre: s.genre ?? null,
      isrc: s.isrc ?? null,
      musicBrainzRecordingId: s.musicBrainzRecordingId ?? null
    }));

    const tagWriteResults = await this.tagWriter.writeBatch(restorePayloads);

    // Audit P1 #5: partition by per-file outcome. Tracks whose physical
    // restore SUCCEEDED must get their DB restore too (otherwise disk=old /
    // DB=new desyncs permanently); failed tracks keep new values everywhere
    // and remain covered by the retained snapshot for retry.
    const succeededSnaps: SongMetadataSnapshot[] = [];
    const restoreFailures: string[] = [];
    tagWriteResults.forEach((r, i) => {
      const snap = snapshot.previousSongs[i];
      if (!snap) return;
      if (r.success) succeededSnaps.push(snap);
      else
        restoreFailures.push(`Undo physical file tag restore failed for ${r.filePath}: ${r.error}`);
    });

    if (succeededSnaps.length === 0) {
      return {
        success: false,
        restoredCount: 0,
        errors: restoreFailures.length > 0 ? restoreFailures : ['No restore payloads succeeded']
      };
    }
    const hadPhysicalFailures = restoreFailures.length > 0;

    try {
      if (this.dbUpdater) {
        for (const snap of succeededSnaps) {
          await this.dbUpdater(snap.songId, {
            title: snap.title,
            artist: snap.artist,
            album: snap.album,
            genre: snap.genre,
            year: snap.year,
            trackNumber: snap.trackNumber,
            discNumber: snap.discNumber,
            isrc: snap.isrc,
            musicBrainzRecordingId: snap.musicBrainzRecordingId
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
          for (const snap of succeededSnaps) {
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

          const manageArtistsOfParsedSong = (
            await import('../../parseSong/manageArtistsOfParsedSong')
          ).default;
          const manageAlbumsOfParsedSong = (
            await import('../../parseSong/manageAlbumsOfParsedSong')
          ).default;
          const manageGenresOfParsedSong = (
            await import('../../parseSong/manageGenresOfParsedSong')
          ).default;
          const manageAlbumArtistOfParsedSong = (
            await import('../../parseSong/manageAlbumArtistOfParsedSong')
          ).default;

          await db.transaction(async (trx) => {
            for (const snap of succeededSnaps) {
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
                  year: snap.year ?? null,
                  trackNumber: snap.trackNumber ?? null,
                  diskNumber: snap.discNumber ?? null,
                  isrc: snap.isrc ?? null,
                  musicBrainzRecordingId: snap.musicBrainzRecordingId ?? null,
                  updatedAt: new Date()
                })
                .where(eq(songs.id, snap.songId));

              if (snap.artist) {
                await manageArtistsOfParsedSong(
                  { songId: snap.songId, songArtists: [snap.artist] },
                  trx
                );
              }
              if (snap.album) {
                const { relevantAlbum } = await manageAlbumsOfParsedSong(
                  {
                    songId: snap.songId,
                    artists: snap.artist ? [snap.artist] : [],
                    // Restore junction from the snapshot's release-level artist.
                    // Snapshots captured before albumArtist existed leave the
                    // junction untouched rather than writing track artists into it.
                    albumArtists: [],
                    albumName: snap.album,
                    songYear: snap.year
                  },
                  trx
                );
                if (snap.albumArtist && relevantAlbum) {
                  await manageAlbumArtistOfParsedSong(
                    { albumArtists: [snap.albumArtist], albumId: relevantAlbum.id },
                    trx
                  );
                }
              }
              if (snap.genre) {
                await manageGenresOfParsedSong(
                  { songId: snap.songId, songGenres: [snap.genre] },
                  trx
                );
              }
            }
          });
        }
      }

      // Partial physical failure: DB was restored only for the succeeded
      // subset (disk & DB agree there). The snapshot stays retained so a
      // retry can attempt the remaining tracks.
      if (hadPhysicalFailures) {
        return {
          success: false,
          restoredCount: succeededSnaps.length,
          errors: [
            ...restoreFailures,
            'Partial undo applied - retry to restore the remaining tracks.'
          ]
        };
      }

      // Only now is the undo considered done: drop the snapshot from the journal.
      await this.historyService.confirmUndo(snapshot.id);

      return { success: true, restoredCount: succeededSnaps.length };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        restoredCount: 0,
        errors: [`Undo DB transaction failed: ${msg}`, ...restoreFailures]
      };
    }
  }
}
