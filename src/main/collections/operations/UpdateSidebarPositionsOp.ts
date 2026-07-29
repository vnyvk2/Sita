import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { playlists } from '../../db/schema';
import { eq, inArray } from 'drizzle-orm';

export interface UpdateSidebarPositionsInput {
  updates: { playlistId: number; sidebarPosition: number | null }[];
}

export class UpdateSidebarPositionsOp implements CollectionOperation<UpdateSidebarPositionsInput, void> {
  public async execute(
    input: UpdateSidebarPositionsInput,
    ctx: OperationContext
  ): Promise<OperationResult<void>> {
    if (input.updates.length === 0) {
      return {
        data: undefined,
        collectionId: 'local:playlist:0' as any,
        operationType: 'playlist.updateSidebarPositions',
        operationInput: input as unknown as Record<string, unknown>,
        inverseInput: {
          operationType: 'playlist.restoreSidebarPositions',
          input: { updates: [] }
        },
        version: 1,
        affectedSongIds: []
      };
    }

    const playlistIds = input.updates.map((u) => u.playlistId);

    // 1. Fetch current positions for inverse
    const currentRows = await ctx.trx
      .select({
        id: playlists.id,
        sidebarPosition: playlists.sidebarPosition
      })
      .from(playlists)
      .where(inArray(playlists.id, playlistIds));

    // 2. Apply updates
    for (const update of input.updates) {
      await ctx.trx
        .update(playlists)
        .set({ sidebarPosition: update.sidebarPosition })
        .where(eq(playlists.id, update.playlistId));
    }

    // 3. Build inverse
    const inverseUpdates = currentRows.map((r) => ({
      playlistId: r.id,
      sidebarPosition: r.sidebarPosition
    }));

    return {
      data: undefined,
      collectionId: 'local:playlist:0' as any,
      operationType: 'playlist.updateSidebarPositions',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.restoreSidebarPositions',
        input: { updates: inverseUpdates }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
