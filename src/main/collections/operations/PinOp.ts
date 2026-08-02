import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { createCollectionId } from '../../../common/collections/id';
import { playlists } from '../../db/schema';
import { eq } from 'drizzle-orm';

export interface PinInput {
  playlistId: number;
}

export class PinOp implements CollectionOperation<PinInput, void> {
  public async execute(
    input: PinInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId } = input;
    const now = new Date();

    await ctx.trx
      .update(playlists)
      .set({ pinnedAt: now })
      .where(eq(playlists.id, playlistId));

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.pin',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.unpin',
        input: { playlistId }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}

export interface UnpinInput {
  playlistId: number;
}

export class UnpinOp implements CollectionOperation<UnpinInput, void> {
  public async execute(
    input: UnpinInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistId } = input;

    await ctx.trx
      .update(playlists)
      .set({ pinnedAt: null })
      .where(eq(playlists.id, playlistId));

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistId),
      operationType: 'playlist.unpin',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.pin',
        input: { playlistId }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
