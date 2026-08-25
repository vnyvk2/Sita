import { createCollectionId } from '../../../common/collections/id';
import type { ReorderInput } from '../../../common/collections/operationInputs';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

/**
 * Rank-based reorder.
 *
 * `newPosition` is interpreted as a dense visual rank (0-based index into the playlist's ordered
 * entries), NOT as a raw stored `position` value. This keeps client semantics stable even when
 * stored positions contain gaps or duplicates (e.g. after removals/restores): each execution reads
 * the current visual order, splices it in memory, clamps the requested rank into range, and
 * persists only the rows whose rank actually changed - writing contiguous positions in the process,
 * which progressively heals legacy gaps.
 */
export class ReorderOp implements CollectionOperation<ReorderInput, void> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(input: ReorderInput, ctx: OperationContext): Promise<OperationResult<void>> {
    const { playlistId, entryId } = input;

    const entries = await this.repository.getEntryPositions(playlistId, ctx.trx);

    const sourceRank = entries.findIndex((e) => e.entryId === entryId);
    if (sourceRank === -1) {
      throw new Error(`Entry ${entryId} not found in playlist ${playlistId}`);
    }

    const targetRank = Math.max(0, Math.min(entries.length - 1, input.newPosition));

    const unchangedResult = (): OperationResult<void> => ({
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.reorder',
      operationInput: { playlistId, entryId, newPosition: input.newPosition },
      // Journal semantics boundary: since the rank-based rewrite, newPosition is
      // a dense visual rank. Journals written by older builds stored absolute
      // stored-position values; replaying those pre-rewrite entries interprets
      // them as ranks (one-time historical edge for undo of pre-migration ops).
      inverseInput: {
        operationType: 'playlist.reorder',
        input: { playlistId, entryId, newPosition: sourceRank }
      },
      version: 1,
      affectedSongIds: [] // Reordering does not affect membership
    });

    if (sourceRank === targetRank) {
      // Nothing to do (also covers single-entry playlists)
      return unchangedResult();
    }

    const nextOrder = [...entries];
    const [moved] = nextOrder.splice(sourceRank, 1);
    nextOrder.splice(targetRank, 0, moved);

    const updates: { entryId: number; position: number }[] = [];
    for (let rank = 0; rank < nextOrder.length; rank += 1) {
      if (nextOrder[rank].position !== rank) {
        updates.push({ entryId: nextOrder[rank].entryId, position: rank });
      }
    }
    await this.repository.updatePositionsBulk(playlistId, updates, ctx.trx);

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.reorder',
      operationInput: { playlistId, entryId, newPosition: input.newPosition },
      inverseInput: {
        operationType: 'playlist.reorder',
        input: { playlistId, entryId, newPosition: sourceRank }
      },
      version: 1,
      affectedSongIds: [] // Reordering does not affect membership
    };
  }
}
