import path from 'path';

import { db } from '@main/db/db';
import { processArtworkFiles } from '@main/other/artworks';
import { ingestTrackDTO } from '@main/parseSong/ingestTrackDTO';
import { tryToParseSong } from '@main/parseSong/parseSong';
import { ArtworkJob } from '@main/workers/jobs/artworkJob';
import { LyricsJob } from '@main/workers/jobs/lyricsJob';
import { ReplayGainJob } from '@main/workers/jobs/replayGainJob';
import { WaveformJob } from '@main/workers/jobs/waveformJob';
import { libraryScheduler } from '@main/workers/jobScheduler';

import logger from '../logger';
import { dataUpdateEvent } from '../main';

export interface SongPoolInput {
  songPath: string;
  folderId?: number;
}

export interface WorkerPoolResult {
  successCount: number;
  errorCount: number;
  errors: Array<{ path: string; error: string }>;
}

export interface SongIngestionMetrics {
  workerParseCount: number;
  localParseFallbackCount: number;
  workerPid?: number;
  batchesProcessed: number;
  totalArtworkBytes: number;
  dbTxDurations: number[];
  artworkDurations: number[];
}

export const songIngestionMetrics: SongIngestionMetrics = {
  workerParseCount: 0,
  localParseFallbackCount: 0,
  batchesProcessed: 0,
  totalArtworkBytes: 0,
  dbTxDurations: [],
  artworkDurations: []
};

export function getSongIngestionMetrics(): Readonly<SongIngestionMetrics> {
  return { ...songIngestionMetrics };
}

export function resetSongIngestionMetrics(): void {
  songIngestionMetrics.workerParseCount = 0;
  songIngestionMetrics.localParseFallbackCount = 0;
  songIngestionMetrics.workerPid = undefined;
  songIngestionMetrics.batchesProcessed = 0;
  songIngestionMetrics.totalArtworkBytes = 0;
  songIngestionMetrics.dbTxDurations = [];
  songIngestionMetrics.artworkDurations = [];
}

/**
 * Local in-process fallback implementation.
 * Used in Vitest unit test environments or if the utilityProcess worker is unavailable.
 */
export const processSongsWithWorkerPoolLocal = async (
  songs: SongPoolInput[],
  abortSignal?: AbortSignal,
  updateProgress?: (current: number, total: number) => void,
  maxConcurrency = 8
): Promise<WorkerPoolResult> => {
  songIngestionMetrics.localParseFallbackCount += songs.length;
  performance.mark('songWorkerPool:executionMode:local_fallback');

  const albumAssetsToQueue = new Map<number, { path: string; title: string }>();
  const songAssetsToQueue: Array<{ id: number; path: string; title: string }> = [];
  const errors: Array<{ path: string; error: string }> = [];
  let successCount = 0;
  let index = 0;
  let hasAborted = false;

  const worker = async () => {
    while (true) {
      if (hasAborted || index >= songs.length) break;

      if (abortSignal?.aborted) {
        hasAborted = true;
        logger.warn('Parsing songs aborted by an abortController signal.', {
          reason: abortSignal?.reason
        });
        break;
      }

      const currentIndex = index++;
      const songData = songs[currentIndex];

      try {
        const result = await tryToParseSong(
          songData.songPath,
          songData.folderId,
          false,
          currentIndex >= 10
        );

        if (result?.songData) {
          successCount++;
          const song = result.songData;
          songAssetsToQueue.push({
            id: song.id,
            path: songData.songPath,
            title: song.title
          });

          const album = result.newAlbum || result.relevantAlbum;
          if (album && !albumAssetsToQueue.has(album.id)) {
            albumAssetsToQueue.set(album.id, {
              path: songData.songPath,
              title: album.title
            });
          }
        } else {
          errors.push({
            path: songData.songPath,
            error: 'tryToParseSong returned no songData'
          });
        }

        if (updateProgress) {
          updateProgress(currentIndex + 1, songs.length);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push({ path: songData.songPath, error: msg });
        logger.error(`Failed to parse '${path.basename(songData.songPath)}'.`, {
          error,
          songPath: songData.songPath
        });
      }
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(maxConcurrency, songs.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  if (!hasAborted) {
    if (albumAssetsToQueue.size > 0) {
      for (const [albumId, data] of albumAssetsToQueue.entries()) {
        libraryScheduler.enqueue(new ArtworkJob(albumId, data.path, data.title, libraryScheduler));
      }
    }

    if (songAssetsToQueue.length > 0) {
      for (const song of songAssetsToQueue) {
        libraryScheduler.enqueue(new WaveformJob(song.id, song.path, song.title, libraryScheduler));
        libraryScheduler.enqueue(new ReplayGainJob(song.id, song.title, libraryScheduler));
        libraryScheduler.enqueue(
          new LyricsJob(song.id, song.title, libraryScheduler, 'interactive')
        );
      }
    }
  }

  return {
    successCount,
    errorCount: errors.length,
    errors
  };
};

/**
 * Single canonical ingestion pipeline for bulk song discovery.
 *
 * In Electron runtime (Phase C3):
 * 1. Delegates CPU-heavy ID3 tag parsing and file stats to the utilityProcess.
 * 2. Streams parsed tracks to Main in bounded 100-track batches with explicit backpressure.
 * 3. Pre-processes artwork files (Sharp decode + disk writes) OUTSIDE of the DB transaction.
 * 4. Commits pure DB operations within a single Drizzle transaction per 100 tracks.
 * 5. Measures DB transaction latency and artwork duration separately (P50/P95).
 * 6. Yields to the libuv event loop (setImmediate) between transactions to prevent UI starvation.
 * 7. Enforces batch-boundary cancellation: active batch commits atomically; subsequent batches are discarded.
 */
export const processSongsWithWorkerPool = async (
  songs: SongPoolInput[],
  abortSignal?: AbortSignal,
  updateProgress?: (current: number, total: number) => void,
  maxConcurrency = 8
): Promise<WorkerPoolResult> => {
  if (songs.length === 0) {
    return { successCount: 0, errorCount: 0, errors: [] };
  }

  const { mediaWorkerBridge } = await import('../workers/process/MediaWorkerBridge');

  if (mediaWorkerBridge.isReady()) {
    const albumAssetsToQueue = new Map<number, { path: string; title: string }>();
    const songAssetsToQueue: Array<{ id: number; path: string; title: string }> = [];
    const errors: Array<{ path: string; error: string }> = [];
    const newSongIds: number[] = [];
    const newArtistIds: number[] = [];
    const newAlbumIds: number[] = [];
    const newGenreIds: number[] = [];
    const unnotifiedSongIds: number[] = [];
    const unnotifiedArtistIds: number[] = [];
    const unnotifiedAlbumIds: number[] = [];
    const unnotifiedGenreIds: number[] = [];
    let successCount = 0;
    let durablyCommittedSongCount = 0;

    try {
      performance.mark('songWorkerPool:executionMode:worker');
      const workerPid = mediaWorkerBridge.getWorkerPid();
      songIngestionMetrics.workerPid = workerPid;

      logger.info(`[songWorkerPool] Ingesting ${songs.length} tracks via utilityProcess worker (pid: ${workerPid ?? 'unknown'})...`);

      await mediaWorkerBridge.parseTrackBatchStream(songs, {
        batchSize: 100,
        abortSignal,
        onBatch: async (batch) => {
          // BATCH-BOUNDARY CANCELLATION SEMANTICS:
          // If the user cancelled the scan while this batch was in transit,
          // discard this and all subsequent batches immediately without touching DB.
          if (abortSignal?.aborted) {
            logger.info(`[songWorkerPool] Scan cancelled at batch boundary. Discarding batch ${batch.batchId}.`);
            return;
          }

          if (batch.tracks.length > 0) {
            songIngestionMetrics.batchesProcessed++;
            songIngestionMetrics.workerParseCount += batch.tracks.length;

            // 1. Calculate batch artwork payload size
            const batchArtworkBytes = batch.tracks.reduce(
              (acc, t) => acc + (t.rawPictureBytes?.byteLength ?? 0),
              0
            );
            songIngestionMetrics.totalArtworkBytes += batchArtworkBytes;

            // 2. Pre-process artwork files OUTSIDE of the DB transaction
            // If worker already generated artwork files, reuse the lightweight payloads directly.
            // Only fall back to local processArtworkFiles if rawPictureBytes was passed without preprocessed payloads.
            const artworkStart = performance.now();
            const preprocessedArtworks = await Promise.all(
              batch.tracks.map(async (t) => {
                if (t.artworkPayloads && t.artworkPayloads.length > 0) {
                  return { payloads: t.artworkPayloads };
                }
                return processArtworkFiles('songs', t.rawPictureBytes);
              })
            );
            const artworkDuration = performance.now() - artworkStart;
            songIngestionMetrics.artworkDurations.push(artworkDuration);

            // 3. Execute pure DB transaction (no filesystem/sharp work inside transaction lock)
            const stagedSongIds: number[] = [];
            const stagedSongAssets: { id: number; path: string; title: string }[] = [];
            const stagedAlbumAssets: Map<number, { path: string; title: string }> = new Map();
            const stagedNewAlbumIds: number[] = [];
            const stagedNewArtistIds: number[] = [];
            const stagedNewGenreIds: number[] = [];
            let stagedSuccessCount = 0;

            const dbTxStart = performance.now();
            await db.transaction(async (trx) => {
              for (let i = 0; i < batch.tracks.length; i++) {
                const track = batch.tracks[i];
                const artwork = preprocessedArtworks[i];

                try {
                  // Nested transaction = SAVEPOINT. If ingestTrackDTO fails partway through
                  // (e.g., song saved but genre linking throws), the SAVEPOINT is rolled back,
                  // leaving zero partial state for this track.
                  const res = await trx.transaction(async (savepointTrx) => {
                    return ingestTrackDTO(track, savepointTrx, artwork);
                  });
                  if (res) {
                    stagedSuccessCount++;
                    stagedSongIds.push(res.songData.id);
                    stagedSongAssets.push({
                      id: res.songData.id,
                      path: track.songPath,
                      title: res.songData.title
                    });

                    const album = res.newAlbum || res.relevantAlbum;
                    if (album && !stagedAlbumAssets.has(album.id) && !albumAssetsToQueue.has(album.id)) {
                      stagedAlbumAssets.set(album.id, {
                        path: track.songPath,
                        title: album.title
                      });
                    }

                    if (res.newAlbum) stagedNewAlbumIds.push(res.newAlbum.id);
                    if (res.newArtists.length > 0) {
                      stagedNewArtistIds.push(...res.newArtists.map((a) => a.id));
                    }
                    if (res.newGenres.length > 0) {
                      stagedNewGenreIds.push(...res.newGenres.map((g) => g.id));
                    }
                  }
                } catch (trackErr) {
                  const msg = trackErr instanceof Error ? trackErr.message : String(trackErr);
                  errors.push({ path: track.songPath, error: msg });
                }
              }
            });
            const dbTxDuration = performance.now() - dbTxStart;
            songIngestionMetrics.dbTxDurations.push(dbTxDuration);

            // Invariant: Durably committed boundary & tracking collections advance ONLY AFTER the DB transaction succeeds
            successCount += stagedSuccessCount;
            newSongIds.push(...stagedSongIds);
            unnotifiedSongIds.push(...stagedSongIds);
            songAssetsToQueue.push(...stagedSongAssets);
            for (const [albumId, albumData] of stagedAlbumAssets.entries()) {
              albumAssetsToQueue.set(albumId, albumData);
            }
            newAlbumIds.push(...stagedNewAlbumIds);
            unnotifiedAlbumIds.push(...stagedNewAlbumIds);
            newArtistIds.push(...stagedNewArtistIds);
            unnotifiedArtistIds.push(...stagedNewArtistIds);
            newGenreIds.push(...stagedNewGenreIds);
            unnotifiedGenreIds.push(...stagedNewGenreIds);
            durablyCommittedSongCount += batch.tracks.length + batch.errors.length;

            logger.info(
              `[songWorkerPool] Batch ${batch.batchId} (${batch.tracks.length} tracks, ${(batchArtworkBytes / 1024 / 1024).toFixed(2)} MB artwork): artwork=${artworkDuration.toFixed(1)}ms, pureDbTx=${dbTxDuration.toFixed(1)}ms`
            );

            // Progressive UI updates:
            // 1st batch (100 tracks) emits immediately for instant visible UX,
            // then every 500 tracks (e.g. at 600, 1100, etc.) to keep UI updated smoothly without render storms.
            if (
              !abortSignal?.aborted &&
              (songIngestionMetrics.batchesProcessed === 1 || unnotifiedSongIds.length >= 500)
            ) {
              if (unnotifiedSongIds.length > 0) dataUpdateEvent('songs/newSong', [...unnotifiedSongIds]);
              if (unnotifiedArtistIds.length > 0) dataUpdateEvent('artists/newArtist', [...unnotifiedArtistIds]);
              if (unnotifiedAlbumIds.length > 0) dataUpdateEvent('albums/newAlbum', [...unnotifiedAlbumIds]);
              if (unnotifiedGenreIds.length > 0) dataUpdateEvent('genres/newGenre', [...unnotifiedGenreIds]);
              unnotifiedSongIds.length = 0;
              unnotifiedArtistIds.length = 0;
              unnotifiedAlbumIds.length = 0;
              unnotifiedGenreIds.length = 0;
            }
          }

          if (batch.errors.length > 0) {
            for (const err of batch.errors) {
              errors.push({ path: err.path, error: err.error });
            }
          }

          if (updateProgress) {
            updateProgress(successCount + errors.length, songs.length);
          }

          // Yield to the libuv event loop to allow IPC messages and renderer tasks to process
          await new Promise<void>((resolve) => setImmediate(resolve));
        }
      });

      // Log isolated transaction and artwork latency percentiles
      if (songIngestionMetrics.dbTxDurations.length > 0) {
        const sortedDb = [...songIngestionMetrics.dbTxDurations].sort((a, b) => a - b);
        const sortedArt = [...songIngestionMetrics.artworkDurations].sort((a, b) => a - b);
        const dbP50 = sortedDb[Math.floor(sortedDb.length * 0.5)];
        const dbP95 = sortedDb[Math.floor(sortedDb.length * 0.95)];
        const artP50 = sortedArt[Math.floor(sortedArt.length * 0.5)];
        const artP95 = sortedArt[Math.floor(sortedArt.length * 0.95)];

        logger.info(
          `[songWorkerPool] Ingestion complete: ${successCount} tracks in ${songIngestionMetrics.batchesProcessed} batches (${(songIngestionMetrics.totalArtworkBytes / 1024 / 1024).toFixed(1)} MB total artwork).\n` +
          `  Pure DB Tx Latency: P50=${dbP50.toFixed(1)}ms, P95=${dbP95.toFixed(1)}ms\n` +
          `  Artwork Decode/Disk: P50=${artP50.toFixed(1)}ms, P95=${artP95.toFixed(1)}ms`
        );
      }

      if (!abortSignal?.aborted) {
        // Enqueue background asset jobs
        if (albumAssetsToQueue.size > 0) {
          for (const [albumId, data] of albumAssetsToQueue.entries()) {
            libraryScheduler.enqueue(new ArtworkJob(albumId, data.path, data.title, libraryScheduler));
          }
        }

        if (songAssetsToQueue.length > 0) {
          for (const song of songAssetsToQueue) {
            libraryScheduler.enqueue(new WaveformJob(song.id, song.path, song.title, libraryScheduler));
            libraryScheduler.enqueue(new ReplayGainJob(song.id, song.title, libraryScheduler));
            libraryScheduler.enqueue(
              new LyricsJob(song.id, song.title, libraryScheduler, 'interactive')
            );
          }
        }

        // Flush any remaining unnotified tracks to the renderer
        if (unnotifiedSongIds.length > 0) dataUpdateEvent('songs/newSong', unnotifiedSongIds);
        if (unnotifiedArtistIds.length > 0) dataUpdateEvent('artists/newArtist', unnotifiedArtistIds);
        if (unnotifiedAlbumIds.length > 0) dataUpdateEvent('albums/newAlbum', unnotifiedAlbumIds);
        if (unnotifiedGenreIds.length > 0) dataUpdateEvent('genres/newGenre', unnotifiedGenreIds);
      }

      return {
        successCount,
        errorCount: errors.length,
        errors
      };
    } catch (workerErr) {
      logger.error(
        `[songWorkerPool] CRITICAL FALLBACK: Worker batch parsing failed at committed count ${durablyCommittedSongCount}/${songs.length}. Falling back to local ingestion in Main.`,
        { error: workerErr }
      );

      // Enqueue background asset jobs and fire data update events for already committed tracks
      if (!abortSignal?.aborted) {
        if (albumAssetsToQueue.size > 0) {
          for (const [albumId, data] of albumAssetsToQueue.entries()) {
            libraryScheduler.enqueue(new ArtworkJob(albumId, data.path, data.title, libraryScheduler));
          }
        }
        if (songAssetsToQueue.length > 0) {
          for (const song of songAssetsToQueue) {
            libraryScheduler.enqueue(new WaveformJob(song.id, song.path, song.title, libraryScheduler));
            libraryScheduler.enqueue(new ReplayGainJob(song.id, song.title, libraryScheduler));
            libraryScheduler.enqueue(
              new LyricsJob(song.id, song.title, libraryScheduler, 'interactive')
            );
          }
        }
        if (unnotifiedSongIds.length > 0) dataUpdateEvent('songs/newSong', unnotifiedSongIds);
        if (unnotifiedArtistIds.length > 0) dataUpdateEvent('artists/newArtist', unnotifiedArtistIds);
        if (unnotifiedAlbumIds.length > 0) dataUpdateEvent('albums/newAlbum', unnotifiedAlbumIds);
        if (unnotifiedGenreIds.length > 0) dataUpdateEvent('genres/newGenre', unnotifiedGenreIds);
      }

      const remainingSongs = songs.slice(durablyCommittedSongCount);
      if (remainingSongs.length === 0) {
        return {
          successCount,
          errorCount: errors.length,
          errors
        };
      }

      const localResult = await processSongsWithWorkerPoolLocal(
        remainingSongs,
        abortSignal,
        updateProgress
          ? (current, _total) => updateProgress(durablyCommittedSongCount + current, songs.length)
          : undefined,
        maxConcurrency
      );

      return {
        successCount: successCount + localResult.successCount,
        errorCount: errors.length + localResult.errorCount,
        errors: [...errors, ...localResult.errors]
      };
    }
  }

  return processSongsWithWorkerPoolLocal(songs, abortSignal, updateProgress, maxConcurrency);
};
