import logger from '../logger';
import {
  getAlbumsWithoutArtwork,
  getSongsWithoutReplayGain,
  getSongsWithoutWaveform
} from '../db/queries/recovery';
import { reconcileExistingMultiGenres } from '../db/queries/genres';
import { libraryScheduler } from '../workers/jobScheduler';
import { ArtworkJob } from '../workers/jobs/artworkJob';
import { WaveformJob } from '../workers/jobs/waveformJob';
import { ReplayGainJob } from '../workers/jobs/replayGainJob';

export const recoverLibraryAssets = async (): Promise<{ remainingWork: boolean }> => {
  try {
    logger.info('Starting crash recovery sync for unfinished imports...');
    let remainingWork = false;

    // 1. Recover missing album artworks (bounded batch)
    const albumsToRecover = await getAlbumsWithoutArtwork(1000);
    if (albumsToRecover.length > 0) {
      if (albumsToRecover.length === 1000) remainingWork = true;
      logger.info(`Found ${albumsToRecover.length} albums missing artwork. Enqueuing jobs...`);
      for (const { albumId, albumTitle, sampleSongPath } of albumsToRecover) {
        libraryScheduler.enqueue(
          new ArtworkJob(albumId, sampleSongPath, albumTitle, libraryScheduler)
        );
      }
    }

    // 2. Recover missing waveforms (bounded batch, filtered for supported codecs by SQL)
    const songsWithoutWaveform = await getSongsWithoutWaveform(500);
    if (songsWithoutWaveform.length > 0) {
      if (songsWithoutWaveform.length === 500) remainingWork = true;
      logger.info(
        `Found ${songsWithoutWaveform.length} supported songs missing waveform. Enqueuing background jobs...`
      );
      for (const song of songsWithoutWaveform) {
        libraryScheduler.enqueue(
          new WaveformJob(song.songId, song.songPath, song.songTitle, libraryScheduler, 'background')
        );
      }
    }

    // 3. Recover missing ReplayGain metrics (bounded batch, filtered for supported codecs by SQL)
    const songsWithoutReplayGain = await getSongsWithoutReplayGain(500);
    if (songsWithoutReplayGain.length > 0) {
      if (songsWithoutReplayGain.length === 500) remainingWork = true;
      logger.info(
        `Found ${songsWithoutReplayGain.length} supported songs missing ReplayGain. Enqueuing background jobs...`
      );
      for (const song of songsWithoutReplayGain) {
        libraryScheduler.enqueue(
          new ReplayGainJob(song.songId, song.songTitle, libraryScheduler, 'background')
        );
      }
    }

    // 4. Reconcile any legacy delimiter genres in the database
    const { reconciledCount } = await reconcileExistingMultiGenres();
    if (reconciledCount > 0) {
      logger.info(`Reconciled ${reconciledCount} legacy multi-genre records in database.`);
    }

    logger.info('Crash recovery sync completed successfully.');
    return { remainingWork };
  } catch (error) {
    logger.error('Failed to run crash recovery sync on startup', { error });
    return { remainingWork: false };
  }
};
