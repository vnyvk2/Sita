import path from 'path';
import logger from '../logger';
import { tryToParseSong } from '../parseSong/parseSong';
import { libraryScheduler } from '../workers/jobScheduler';
import { ArtworkJob } from '../workers/jobs/artworkJob';

export interface SongPoolInput {
  songPath: string;
  folderId?: number;
}

/**
 * processSongsWithWorkerPool is the single canonical ingestion pipeline for bulk song discovery.
 * It uses bounded concurrency, safe error isolation, clean cancellation, and automatically
 * routes new albums to the libraryScheduler to ensure Architectural Invariants are met.
 */
export const processSongsWithWorkerPool = async (
  songs: SongPoolInput[],
  abortSignal?: AbortSignal,
  updateProgress?: (current: number, total: number) => void,
  maxConcurrency = 8
) => {
  const albumAssetsToQueue = new Map<number, { path: string; title: string }>();
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

        const album = result?.newAlbum || result?.relevantAlbum;
        if (album) {
          if (!albumAssetsToQueue.has(album.id)) {
            albumAssetsToQueue.set(album.id, {
              path: songData.songPath,
              title: album.title
            });
          }
        }

        if (updateProgress) {
          updateProgress(currentIndex + 1, songs.length);
        }
      } catch (error) {
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

  if (albumAssetsToQueue.size > 0 && !hasAborted) {
    for (const [albumId, data] of albumAssetsToQueue.entries()) {
      libraryScheduler.enqueue(new ArtworkJob(albumId, data.path, data.title, libraryScheduler));
    }
  }
};
