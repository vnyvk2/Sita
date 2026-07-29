import { db } from '@main/db/db';
import { linkArtworkToPlaylist, saveArtworks } from '@main/db/queries/artworks';
import { generateLocalArtworkBuffer } from '@main/updateSong/updateSongId3Tags';

import { resetArtworkCache } from '../fs/resolveFilePaths';
import logger from '../logger';
import { dataUpdateEvent } from '../main';
import { processArtworkFiles } from '../other/artworks';

import { libraryScheduler } from '../workers/jobScheduler';
// (GC job will be dispatched by Maintenance orchestrator)
import { eq } from 'drizzle-orm';
import { artworksPlaylists } from '@main/db/schema';

const addArtworkToAPlaylist = async (playlistId: number, artworkPath: string) => {
  try {
    const buffer = await generateLocalArtworkBuffer(artworkPath || '');

    const processedArtwork = await processArtworkFiles('playlist', buffer);

    await db.transaction(async (trx) => {
      // Remove previous artwork links
      await trx.delete(artworksPlaylists).where(eq(artworksPlaylists.playlistId, playlistId));

      let artworks = processedArtwork.existing;
      if (!artworks && processedArtwork.payloads) {
        artworks = await saveArtworks(processedArtwork.payloads, trx);
      }

      if (artworks && artworks.length > 0) {
        await linkArtworkToPlaylist(playlistId, artworks[0].id, trx);
      }
    });
    
    libraryScheduler.requestMaintenance();
    
    resetArtworkCache('playlistArtworks');
    dataUpdateEvent('playlists');

    return undefined;
  } catch (error) {
    logger.error('Failed to add an artwork to a playlist.', { error });
  }
};

export default addArtworkToAPlaylist;
