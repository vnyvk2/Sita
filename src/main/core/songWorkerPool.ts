import path from 'path';

import { db } from '@main/db/db';
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
 * 3. Commits 100 tracks per Drizzle transaction in Main, measuring P50/P95 latencies.
 * 4. Yields to the libuv event loop (setImmediate) between transactions to prevent UI starvation.
 * 5. Aggregates error reports cleanly without generating log storms.
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

  if (typeof process !== 'undefined' && process.versions?.electron && !process.env.VITEST) {
    try {
      const { mediaWorkerBridge } = await import('../workers/process/MediaWorkerBridge');

      const albumAssetsToQueue = new Map<number, { path: string; title: string }>();
      const songAssetsToQueue: Array<{ id: number; path: string; title: string }> = [];
      const errors: Array<{ path: string; error: string }> = [];
      const newSongIds: number[] = [];
      const newArtistIds: number[] = [];
      const newAlbumIds: number[] = [];
      const newGenreIds: number[] = [];
      const batchTxDurations: number[] = [];
      let successCount = 0;

      await mediaWorkerBridge.parseTrackBatchStream(songs, {
        batchSize: 100,
        abortSignal,
        onBatch: async (batch) => {
          if (batch.tracks.length > 0) {
            const txStart = performance.now();

            await db.transaction(async (trx) => {
              for (const track of batch.tracks) {
                try {
                  const res = await ingestTrackDTO(track, trx);
                  if (res) {
                    successCount++;
                    newSongIds.push(res.songData.id);
                    songAssetsToQueue.push({
                      id: res.songData.id,
                      path: track.songPath,
                      title: res.songData.title
                    });

                    const album = res.newAlbum || res.relevantAlbum;
                    if (album && !albumAssetsToQueue.has(album.id)) {
                      albumAssetsToQueue.set(album.id, {
                        path: track.songPath,
                        title: album.title
                      });
                    }

                    if (res.newAlbum) newAlbumIds.push(res.newAlbum.id);
                    if (res.newArtists.length > 0) {
                      newArtistIds.push(...res.newArtists.map((a) => a.id));
                    }
                    if (res.newGenres.length > 0) {
                      newGenreIds.push(...res.newGenres.map((g) => g.id));
                    }
                  }
                } catch (trackErr) {
                  const msg = trackErr instanceof Error ? trackErr.message : String(trackErr);
                  errors.push({ path: track.songPath, error: msg });
                }
              }
            });

            const txDuration = performance.now() - txStart;
            batchTxDurations.push(txDuration);
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

      // Log transaction performance metrics
      if (batchTxDurations.length > 0) {
        const sorted = [...batchTxDurations].sort((a, b) => a - b);
        const p50 = sorted[Math.floor(sorted.length * 0.5)];
        const p95 = sorted[Math.floor(sorted.length * 0.95)];
        logger.info(
          `[songWorkerPool] Ingestion completed: ${successCount} tracks in ${batchTxDurations.length} batches. Tx duration P50: ${p50.toFixed(1)}ms, P95: ${p95.toFixed(1)}ms.`
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

        // Notify renderer of updates
        if (newSongIds.length > 0) dataUpdateEvent('songs/newSong', newSongIds);
        if (newArtistIds.length > 0) dataUpdateEvent('artists/newArtist', newArtistIds);
        if (newAlbumIds.length > 0) dataUpdateEvent('albums/newAlbum', newAlbumIds);
        if (newGenreIds.length > 0) dataUpdateEvent('genres/newGenre', newGenreIds);
      }

      return {
        successCount,
        errorCount: errors.length,
        errors
      };
    } catch (workerErr) {
      logger.warn('[songWorkerPool] Worker batch parsing failed, falling back to local ingestion in Main.', {
        error: workerErr
      });
    }
  }

  return processSongsWithWorkerPoolLocal(songs, abortSignal, updateProgress, maxConcurrency);
};
