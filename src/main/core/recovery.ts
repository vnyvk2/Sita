import logger from '../logger';
import { getAlbumsWithoutArtwork } from '../db/queries/recovery';
import { libraryScheduler } from '../workers/jobScheduler';
import { ArtworkJob } from '../workers/jobs/artworkJob';

export const resumeUnfinishedImports = async () => {
  try {
    logger.info('Starting crash recovery sync for unfinished imports...');
    const albumsToRecover = await getAlbumsWithoutArtwork();

    if (albumsToRecover.length === 0) {
      logger.info('No unfinished imports found during crash recovery.');
      return;
    }

    logger.info(`Found ${albumsToRecover.length} albums missing artwork. Enqueuing jobs...`);
    for (const { albumId, sampleSongPath } of albumsToRecover) {
      libraryScheduler.enqueue(new ArtworkJob(albumId, sampleSongPath, libraryScheduler));
    }
    
    logger.info('Crash recovery sync completed successfully.');
  } catch (error) {
    logger.error('Failed to run crash recovery sync on startup', { error });
  }
};
