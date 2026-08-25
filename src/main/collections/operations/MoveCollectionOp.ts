import { eq, inArray } from 'drizzle-orm';

import { createCollectionId } from '../../../common/collections/id';
import type { MoveCollectionInput } from '../../../common/collections/operationInputs';
import { playlists } from '../../db/schema';
import { HierarchyService } from '../engine/HierarchyService';
import type { CollectionOperation, OperationContext, OperationResult } from './types';

export class MoveCollectionOp implements CollectionOperation<MoveCollectionInput, void> {
  private resolver: HierarchyService;

  constructor(resolver: HierarchyService = new HierarchyService()) {
    this.resolver = resolver;
  }

  public async execute(
    input: MoveCollectionInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const playlistIds =
      input.playlistIds ?? ((input as any).playlistId ? [(input as any).playlistId] : []);
    const targetParentId =
      input.targetParentId !== undefined
        ? input.targetParentId
        : ((input as any).newParentId ?? null);

    if (playlistIds.length === 0) {
      return {
        data: undefined,
        collectionId: createCollectionId('local', 'playlist', 0),
        operationType: 'playlist.move',
        operationInput: input as unknown as Record<string, unknown>,
        inverseInput: {
          operationType: 'playlist.restoreMove',
          input: { moves: [] }
        },
        version: 1,
        affectedSongIds: []
      };
    }

    // 1. Validate the move using HierarchyService to prevent cycles.
    // ctx.trx is mandatory here: validateMove queries the hierarchy, and the
    // global connection is held by this transaction on PGlite (single-connection
    // engine) - using it would self-deadlock.
    for (const sourceId of playlistIds) {
      await this.resolver.validateMove(sourceId, targetParentId, ctx.trx);
    }

    // 2. Fetch the current state to generate the inverse operation
    const currentRows = await ctx.trx
      .select({
        id: playlists.id,
        parentId: playlists.parentId
      })
      .from(playlists)
      .where(inArray(playlists.id, playlistIds));

    if (currentRows.length !== playlistIds.length) {
      throw new Error('One or more playlists to move were not found.');
    }

    // If all current rows share the same parent, we can just issue a simple MoveCollectionOp as inverse.
    // However, if they came from different parents, we would theoretically need a composite inverse,
    // or we can implement a `RestoreMoveOp` that accepts an array of { id, parentId }.
    // Let's create `RestoreMoveOp` internally to handle complex inverses.

    // 3. Perform the update
    await ctx.trx
      .update(playlists)
      .set({ parentId: targetParentId })
      .where(inArray(playlists.id, playlistIds));

    this.resolver.invalidateCache();

    // Return the inverse
    const restoreInput = {
      moves: currentRows.map((r) => ({
        playlistId: r.id,
        parentId: r.parentId
      }))
    };

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', playlistIds[0] ?? 0),
      operationType: 'playlist.move',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.restoreMove',
        input: restoreInput
      },
      version: 1,
      affectedSongIds: []
    };
  }
}

export interface RestoreMoveInput {
  moves: { playlistId: number; parentId: number | null }[];
}

export class RestoreMoveOp implements CollectionOperation<RestoreMoveInput, void> {
  public async execute(
    input: RestoreMoveInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    for (const move of input.moves) {
      await ctx.trx
        .update(playlists)
        .set({ parentId: move.parentId })
        .where(eq(playlists.id, move.playlistId));
    }

    const firstId = input.moves[0]?.playlistId ?? 0;

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', firstId),
      operationType: 'playlist.restoreMove',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.move',
        input: { playlistIds: input.moves.map((m) => m.playlistId), targetParentId: null }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
