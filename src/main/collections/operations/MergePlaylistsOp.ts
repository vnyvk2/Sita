import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { createCollectionId } from '../../../common/collections/id';
import { playlists, playlistEntries } from '../../db/schema';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { eq, inArray } from 'drizzle-orm';

export interface MergePlaylistsInput {
  sourcePlaylistIds: number[];
  targetPlaylistId: number;
}

export class MergePlaylistsOp implements CollectionOperation<MergePlaylistsInput, { deltaCount: number; deltaDuration: number }> {
  private repository: PlaylistRepository;

  constructor(repository: PlaylistRepository = new PlaylistRepository()) {
    this.repository = repository;
  }

  public async execute(
    input: MergePlaylistsInput,
    ctx: OperationContext
  ): Promise<OperationResult<{ deltaCount: number; deltaDuration: number }>> {
    const { sourcePlaylistIds, targetPlaylistId } = input;

    // 1. Get current items in target to calculate starting position and for deduplication
    const targetEntries = await this.repository.getEntries(targetPlaylistId, {}, ctx.trx);
    const targetSongIds = new Set(targetEntries.map(e => e.entry.songId));
    
    let nextPosition = 0;
    if (targetEntries.length > 0) {
      nextPosition = Math.max(...targetEntries.map(e => e.entry.position)) + 1;
    }

    // 2. Fetch all entries from all sources
    const allSourceEntries = await ctx.trx
      .select({
        songId: playlistEntries.songId
      })
      .from(playlistEntries)
      .where(inArray(playlistEntries.playlistId, sourcePlaylistIds))
      .orderBy(playlistEntries.playlistId, playlistEntries.position);

    // 3. Deduplicate
    const newSongIds = new Set<number>();
    const entriesToInsert: any[] = [];

    for (const entry of allSourceEntries) {
      if (!targetSongIds.has(entry.songId) && !newSongIds.has(entry.songId)) {
        newSongIds.add(entry.songId);
        entriesToInsert.push({
          playlistId: targetPlaylistId,
          songId: entry.songId,
          position: nextPosition++,
          addedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    // 4. Insert and compute deltas
    const insertedEntryIds: number[] = [];
    let mergeDeltas = { itemCountDelta: 0, durationDelta: 0 };

    if (entriesToInsert.length > 0) {
      const inserted = await ctx.trx
        .insert(playlistEntries)
        .values(entriesToInsert)
        .returning({ id: playlistEntries.id });
        
      insertedEntryIds.push(...inserted.map(i => i.id));
      
      mergeDeltas = await this.repository.computeStatisticsDelta(Array.from(newSongIds), ctx.trx);
      await this.repository.applyStatisticsDelta(targetPlaylistId, mergeDeltas, ctx.trx);
    }

    // Inverse is removing these exact entry IDs
    const inverseInput = {
      playlistId: targetPlaylistId,
      entryIds: insertedEntryIds
    };

    return {
      data: { deltaCount: mergeDeltas.itemCountDelta, deltaDuration: mergeDeltas.durationDelta },
      collectionId: createCollectionId('local', 'playlist', targetPlaylistId),
      operationType: 'playlist.merge',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.removeSongs',
        input: inverseInput
      },
      version: 1,
      affectedSongIds: Array.from(newSongIds)
    };
  }
}
