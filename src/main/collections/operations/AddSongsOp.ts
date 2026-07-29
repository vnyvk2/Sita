import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';

export interface AddSongsInput {
  playlistId: number;
  songIds: readonly number[];
  insertAt?: number;
}

export class AddSongsOp implements CollectionOperation<AddSongsInput, { addedCount: number }> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: AddSongsInput,
    ctx: OperationContext
  ): Promise<OperationResult<{ addedCount: number }>> {
    const { playlistId, songIds, insertAt } = input;
    if (songIds.length === 0) {
      throw new Error('No songs provided to AddSongsOp');
    }

    const maxPos = await this.repository.getMaxPosition(playlistId, ctx.trx);
    const startIndex = insertAt !== undefined ? insertAt : (maxPos === 0 ? 0 : maxPos + 1);

    if (insertAt !== undefined) {
      await this.repository.shiftPositions(playlistId, startIndex, songIds.length, ctx.trx);
    }

    const newEntries = songIds.map((songId, index) => ({
      playlistId,
      songId,
      position: startIndex + index,
      source: 'manual' as const
    }));

    const inserted = await this.repository.insertEntries(newEntries, ctx.trx);

    return {
      data: { addedCount: inserted.length },
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.addSongs',
      operationInput: { songIds, insertAt },
      reverseData: {
        type: 'removeEntries',
        entryIds: inserted.map(e => e.id)
      },
      version: 1,
      affectedSongIds: songIds
    };
  }
}
