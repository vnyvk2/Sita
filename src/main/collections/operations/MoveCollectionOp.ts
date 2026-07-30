import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { createCollectionId } from '../../../common/collections/id';
import { playlists } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { HierarchyService } from '../engine/HierarchyService';

export interface MoveCollectionInput {
  playlistIds: number[];
  targetParentId: number | null;
}

export class MoveCollectionOp implements CollectionOperation<MoveCollectionInput, void> {
  private resolver: HierarchyService;

  constructor(resolver: HierarchyService = new HierarchyService()) {
    this.resolver = resolver;
  }

  public async execute(
    input: MoveCollectionInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    const { playlistIds, targetParentId } = input;

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

    // 1. Validate the move using HierarchyService to prevent cycles
    for (const sourceId of playlistIds) {
      await this.resolver.validateMove(sourceId, targetParentId);
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

    // Return the inverse
    const restoreInput = {
      moves: currentRows.map((r) => ({
        playlistId: r.id,
        parentId: r.parentId
      }))
    };

    return {
      data: undefined,
      collectionId: createCollectionId('local', 'playlist', 0),
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

    return {
      data: undefined,
      collectionId: 'local:playlist:0' as any,
      operationType: 'playlist.restoreMove',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.move',
        input: { playlistIds: [], targetParentId: null } // We don't generate inverse of inverse for now
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
