import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';

export interface RestoreSongsInput {
  playlistId: number;
  entries: {
    playlistId: number;
    songId: number;
    position: number;
    source: string;
    createdAt?: Date;
  }[];
}

export class RestoreSongsOp implements CollectionOperation<RestoreSongsInput, { restoredCount: number }> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: RestoreSongsInput,
    ctx: OperationContext
  ): Promise<OperationResult<{ restoredCount: number }>> {
    const { playlistId, entries } = input;
    if (entries.length === 0) {
      throw new Error('No entries provided to RestoreSongsOp');
    }

    const entriesToInsert = entries.map(e => ({
      ...e,
      addedAt: typeof e.addedAt === 'string' ? new Date(e.addedAt) : e.addedAt,
      createdAt: typeof e.createdAt === 'string' ? new Date(e.createdAt) : e.createdAt,
      updatedAt: typeof e.updatedAt === 'string' ? new Date(e.updatedAt) : e.updatedAt,
    }));

    // Restore the exact entries
    const inserted = await this.repository.insertEntries(entriesToInsert as any, ctx.trx);
    const affectedSongIds = Array.from(new Set(inserted.map(e => e.songId)));

    return {
      data: { restoredCount: inserted.length },
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.restoreSongs',
      operationInput: { playlistId, entries },
      inverseInput: {
        operationType: 'playlist.removeSongs',
        input: { playlistId, entryIds: inserted.map(e => e.id) }
      },
      version: 1,
      affectedSongIds
    };
  }
}
