import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';

export interface DeleteInput {
  playlistId: number;
}

export class DeleteOp implements CollectionOperation<DeleteInput, void> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: DeleteInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId } = input;

    const playlist = await this.repository.getById(playlistId, ctx.trx);
    if (!playlist) {
      throw new Error(`Playlist ${playlistId} not found`);
    }

    // Get all entries so we know what song memberships are affected, and for undo
    const entries = await this.repository.getEntries(playlistId, {}, ctx.trx);

    // Delete playlist (cascade deletes entries if DB is set up, but let's be explicit or rely on repo)
    await this.repository.deletePlaylist(playlistId, ctx.trx);

    const affectedSongIds = Array.from(new Set(entries.map(e => e.entry.songId)));

    const duration = typeof playlist.totalDuration === 'string' ? parseFloat(playlist.totalDuration) : (playlist.totalDuration || 0);

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.delete',
      operationInput: { playlistId },
      inverseInput: {
        operationType: 'playlist.restore',
        input: { playlist, entries: entries.map(e => e.entry) }
      },
      version: 1,
      affectedSongIds,
      statsDelta: playlist.parentId ? {
        targetPlaylistId: playlist.parentId,
        itemCountDelta: -(playlist.itemCount || 0),
        durationDelta: -duration
      } : undefined
    };
  }
}
