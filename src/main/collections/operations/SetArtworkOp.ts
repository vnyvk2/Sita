import { eq } from 'drizzle-orm';
import { artworksPlaylists } from '../../db/schema';
import { linkArtworkToPlaylist, saveArtworks } from '../../db/queries/artworks';
import { generateLocalArtworkBuffer } from '../../updateSong/updateSongId3Tags';
import { resetArtworkCache } from '../../fs/resolveFilePaths';
import logger from '../../logger';
import { dataUpdateEvent } from '../../main';
import { processArtworkFiles } from '../../other/artworks';
import { libraryScheduler } from '../../workers/jobScheduler';
import { createCollectionId } from '../../../common/collections/id';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export interface SetArtworkInput {
  playlistId: number;
  artworkPath: string;
}

export class SetArtworkOp implements CollectionOperation<SetArtworkInput, void> {
  constructor(private readonly repository: PlaylistRepository) {}

  public async execute(
    input: SetArtworkInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId, artworkPath } = input;

    const playlist = await this.repository.getById(playlistId, ctx.trx);
    if (!playlist) {
      throw new Error(`Playlist ${playlistId} not found`);
    }

    try {
      const buffer = await generateLocalArtworkBuffer(artworkPath || '');
      const processedArtwork = await processArtworkFiles('playlist', buffer);

      // Remove previous artwork links inside transaction
      await ctx.trx.delete(artworksPlaylists).where(eq(artworksPlaylists.playlistId, playlistId));

      let artworks = processedArtwork.existing;
      if (!artworks && processedArtwork.payloads) {
        artworks = await saveArtworks(processedArtwork.payloads, ctx.trx);
      }

      if (artworks && artworks.length > 0) {
        await linkArtworkToPlaylist(playlistId, artworks[0].id, ctx.trx);
      }

      libraryScheduler.requestMaintenance();
      resetArtworkCache('playlistArtworks');
      dataUpdateEvent('playlists');
    } catch (error) {
      logger.error('Failed to set artwork for playlist', { playlistId, artworkPath, error });
      throw error;
    }

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.setArtwork',
      operationInput: { playlistId, artworkPath },
      inverseInput: {
        operationType: 'playlist.setArtwork',
        input: { playlistId, artworkPath: '' }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
