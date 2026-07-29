import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { createCollectionId } from '../../../common/collections/id';

export interface ReorderInput {
  playlistId: number;
  entryId: number;
  newPosition: number;
}

export class ReorderOp implements CollectionOperation<ReorderInput, void> {
  private readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository) {
    this.repository = repository;
  }

  public async execute(
    input: ReorderInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId, entryId, newPosition } = input;

    // Get the current position of the entry
    // We could query it efficiently but since playlists aren't huge, let's just get it
    const entries = await this.repository.getEntries(playlistId, {}, ctx.trx);
    const targetEntry = entries.find(e => e.entry.id === entryId);
    
    if (!targetEntry) {
      throw new Error(`Entry ${entryId} not found in playlist ${playlistId}`);
    }

    const oldPosition = targetEntry.entry.position;

    if (oldPosition === newPosition) {
      // Nothing to do
      return {
        data: undefined,
        collectionId: createCollectionId('local', 'playlist', playlistId),
        operationType: 'playlist.reorder',
        operationInput: input as unknown as Record<string, unknown>,
        reverseData: {
          type: 'reorder',
          entryId,
          oldPosition
        },
        version: 1,
        affectedSongIds: [] // Reordering does not affect membership
      };
    }

    // Move entry out of the way to avoid unique constraint violations if any
    await this.repository.updateEntryPosition(entryId, -1, ctx.trx);

    if (newPosition < oldPosition) {
      // Shift entries between newPosition and oldPosition - 1 UP by 1
      await this.repository.shiftPositionsRange(
        playlistId, 
        newPosition, 
        oldPosition - 1, 
        1, 
        ctx.trx
      );
    } else {
      // Shift entries between oldPosition + 1 and newPosition DOWN by 1
      await this.repository.shiftPositionsRange(
        playlistId, 
        oldPosition + 1, 
        newPosition, 
        -1, 
        ctx.trx
      );
    }

    // Put entry in new position
    await this.repository.updateEntryPosition(entryId, newPosition, ctx.trx);

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.reorder',
      operationInput: input as unknown as Record<string, unknown>,
      reverseData: {
        type: 'reorder',
        entryId,
        oldPosition
      },
      version: 1,
      affectedSongIds: [] // Reordering does not affect membership
    };
  }
}
