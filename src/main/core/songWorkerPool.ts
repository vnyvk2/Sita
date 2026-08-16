import path from 'path';

import logger from '../logger';
import { tryToParseSong } from '../parseSong/parseSong';
import { ArtworkJob } from '../workers/jobs/artworkJob';
import { LyricsJob } from '../workers/jobs/lyricsJob';
import { ReplayGainJob } from '../workers/jobs/replayGainJob';
import { WaveformJob } from '../workers/jobs/waveformJob';
import { libraryScheduler } from '../workers/jobScheduler';

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
 * ProcessSongsWithWorkerPool is the single canonical ingestion pipeline for bulk song discovery. It
 * uses bounded concurrency, safe error isolation, clean cancellation, and automatically routes new
 * albums to the libraryScheduler to ensure Architectural Invariants are met.
 */
export const processSongsWithWorkerPool = async (
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
