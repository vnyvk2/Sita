import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';
import { songs } from '../../db/schema';
import { inArray, eq } from 'drizzle-orm';

export interface AddSongsInput {
  playlistId: number;
  songIds: readonly number[];
  insertAt?: number;
}

export class AddSongsOp implements CollectionOperation<AddSongsInput, { addedCount: number; deltaCount: number; deltaDuration: number }> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: AddSongsInput,
    ctx: OperationContext
  ): Promise<OperationResult<{ addedCount: number; deltaCount: number; deltaDuration: number }>> {
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

    // Compute delta duration
    let deltaDuration = 0;
    if (songIds.length > 0) {
      const songRows = await ctx.trx
        .select({ id: songs.id, duration: songs.duration })
        .from(songs)
        .where(inArray(songs.id, Array.from(new Set(songIds))));
      
      const durationMap = new Map(songRows.map(r => [r.id, r.duration || 0]));
      for (const id of songIds) {
        deltaDuration += durationMap.get(id) || 0;
      }
    }

    return {
      data: { addedCount: inserted.length, deltaCount: inserted.length, deltaDuration },
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.addSongs',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.removeSongs',
        input: { playlistId, entryIds: inserted.map(e => e.id) }
      },
      version: 1,
      affectedSongIds: songIds
    };
  }
}
