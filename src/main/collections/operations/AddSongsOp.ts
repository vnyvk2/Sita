import { createCollectionId } from '../../../common/collections/id';
import type { AddSongsInput } from '../../../common/collections/operationInputs';
import { MembershipBootstrap } from '../../membership/bootstrap/MembershipBootstrap';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export class AddSongsOp implements CollectionOperation<
  AddSongsInput,
  { addedCount: number; deltaCount: number; deltaDuration: number }
> {
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
    const startIndex = insertAt !== undefined ? insertAt : maxPos + 1;

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

    // Compute delta using repository
    const { itemCountDelta, durationDelta } = await this.repository.computeStatisticsDelta(
      songIds,
      ctx.trx
    );

    const container = await MembershipBootstrap.getInstance();
    container.service.notifyMembershipChanged({
      type: 'added',
      collection: { kind: 'playlist', id: playlistId },
      memberKind: 'song',
      members: songIds.map((id) => ({ kind: 'song', id }))
    });

    return {
      data: {
        addedCount: inserted.length,
        deltaCount: itemCountDelta,
        deltaDuration: durationDelta
      },
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.addSongs',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.removeSongs',
        input: { playlistId, entryIds: inserted.map((e) => e.id) }
      },
      version: 1,
      affectedSongIds: songIds,
      statsDelta: {
        targetPlaylistId: playlistId,
        itemCountDelta,
        durationDelta
      }
    };
  }
}
