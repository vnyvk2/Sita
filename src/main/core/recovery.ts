import logger from '../logger';
import { getAlbumsWithoutArtwork } from '../db/queries/recovery';
import { reconcileExistingMultiGenres } from '../db/queries/genres';
import { libraryScheduler } from '../workers/jobScheduler';
import { ArtworkJob } from '../workers/jobs/artworkJob';

export const recoverLibraryAssets = async () => {
  try {
    logger.info('Starting crash recovery sync for unfinished imports...');
    const albumsToRecover = await getAlbumsWithoutArtwork();

    if (albumsToRecover.length > 0) {
      logger.info(`Found ${albumsToRecover.length} albums missing artwork. Enqueuing jobs...`);
      for (const { albumId, albumTitle, sampleSongPath } of albumsToRecover) {
        libraryScheduler.enqueue(new ArtworkJob(albumId, sampleSongPath, albumTitle, libraryScheduler));
      }
    } else {
      logger.info('No unfinished imports found during crash recovery.');
    }

    // Reconcile any legacy delimiter genres in the database
    const { reconciledCount } = await reconcileExistingMultiGenres();
    if (reconciledCount > 0) {
      logger.info(`Reconciled ${reconciledCount} legacy multi-genre records in database.`);
    }
    
    logger.info('Crash recovery sync completed successfully.');
  } catch (error) {
    logger.error('Failed to run crash recovery sync on startup', { error });
  }
};
