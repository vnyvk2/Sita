import { createCollectionId } from '../../../common/collections/id';
import { PlaylistRepository, type PlaylistEntryRow } from '../repositories/PlaylistRepository';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

type RestorablePlaylistEntry = Omit<PlaylistEntryRow, 'addedAt' | 'createdAt' | 'updatedAt'> & {
  addedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

export interface RestoreSongsInput {
  playlistId: number;
  entries: RestorablePlaylistEntry[];
}

export class RestoreSongsOp implements CollectionOperation<
  RestoreSongsInput,
  { restoredCount: number }
> {
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

    const entriesToInsert: PlaylistEntryRow[] = entries.map((e) => ({
      ...e,
      addedAt: typeof e.addedAt === 'string' ? new Date(e.addedAt) : e.addedAt,
      createdAt: typeof e.createdAt === 'string' ? new Date(e.createdAt) : e.createdAt,
      updatedAt: typeof e.updatedAt === 'string' ? new Date(e.updatedAt) : e.updatedAt
    }));

    // Restore the exact entries
    const inserted = await this.repository.restoreEntriesWithIds(entriesToInsert, ctx.trx);

    // Restored rows carry their historical position values verbatim, which can
    // collide with (or gap against) positions taken on by entries that were
    // reordered after the removal. Renumber the playlist to a contiguous,
    // collision-free order while preserving current visual order.
    await this.repository.normalizePositions(playlistId, ctx.trx);

    const restoredSongIds = inserted.map((e) => e.songId);
    const affectedSongIds = Array.from(new Set(restoredSongIds));
    const { itemCountDelta, durationDelta } = await this.repository.computeStatisticsDelta(
      restoredSongIds,
      ctx.trx
    );

    return {
      data: { restoredCount: inserted.length },
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.restoreSongs',
      operationInput: { playlistId, entries },
      inverseInput: {
        operationType: 'playlist.removeSongs',
        input: { playlistId, entryIds: inserted.map((e) => e.id) }
      },
      version: 1,
      affectedSongIds,
      statsDelta: {
        targetPlaylistId: playlistId,
        itemCountDelta,
        durationDelta
      }
    };
  }
}
