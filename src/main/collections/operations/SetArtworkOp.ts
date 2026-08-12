import { eq } from 'drizzle-orm';
import { artworks, artworksPlaylists } from '../../db/schema';
import { linkArtworkToPlaylist, saveArtworks } from '../../db/queries/artworks';
import { generateLocalArtworkBuffer } from '../../updateSong/updateSongId3Tags';
import logger from '../../logger';
import { processArtworkFiles, type ArtworkPayload } from '../../other/artworks';
import { createCollectionId } from '../../../common/collections/id';
import type { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export interface ProcessedArtworkPayload {
  existing?: (typeof artworks.$inferSelect)[];
  payloads?: ArtworkPayload[];
}

export interface SetArtworkInput {
  playlistId: number;
  artworkPath?: string;
  artworkId?: number;
  processedArtwork?: ProcessedArtworkPayload;
}

export class SetArtworkOp implements CollectionOperation<SetArtworkInput, void> {
  constructor(private readonly repository: PlaylistRepository) {}

  public async execute(
    input: SetArtworkInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId, artworkPath, artworkId, processedArtwork } = input;

    const playlist = await this.repository.getById(playlistId, ctx.trx);
    if (!playlist) {
      throw new Error(`Playlist ${playlistId} not found`);
    }

    // Capture existing artwork link for undo snapshot
    const existingLinks = await ctx.trx
      .select({ artworkId: artworksPlaylists.artworkId })
      .from(artworksPlaylists)
      .where(eq(artworksPlaylists.playlistId, playlistId))
      .limit(1);

    const previousArtworkId = existingLinks.length > 0 ? existingLinks[0].artworkId : undefined;

    try {
      if (artworkId !== undefined) {
        // Direct relink flow (e.g. undo operation)
        await ctx.trx.delete(artworksPlaylists).where(eq(artworksPlaylists.playlistId, playlistId));
        if (artworkId > 0) {
          await linkArtworkToPlaylist(playlistId, artworkId, ctx.trx);
        }
      } else {
        // File artwork processing flow
        const processed =
          processedArtwork ??
          (await processArtworkFiles(
            'playlist',
            await generateLocalArtworkBuffer(artworkPath || '')
          ));

        await ctx.trx.delete(artworksPlaylists).where(eq(artworksPlaylists.playlistId, playlistId));

        let savedArtworks = processed.existing;
        if (!savedArtworks && processed.payloads) {
          savedArtworks = await saveArtworks(processed.payloads, ctx.trx);
        }

        if (savedArtworks && savedArtworks.length > 0) {
          await linkArtworkToPlaylist(playlistId, savedArtworks[0].id, ctx.trx);
        }
      }
    } catch (error) {
      logger.error('Failed to set artwork for playlist', { playlistId, artworkPath, artworkId, error });
      throw error;
    }

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.setArtwork',
      operationInput: { playlistId, artworkPath: artworkPath ?? '', artworkId },
      inverseInput: {
        operationType: 'playlist.setArtwork',
        input: { playlistId, artworkId: previousArtworkId ?? 0 }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
