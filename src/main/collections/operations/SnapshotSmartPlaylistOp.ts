import type { CollectionOperation, OperationContext, OperationResult } from './types';
import { createCollectionId } from '../../../common/collections/id';
import { playlists, playlistEntries } from '../../db/schema';
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { eq } from 'drizzle-orm';

export interface SnapshotSmartPlaylistInput {
  smartPlaylistId: number;
  snapshotName: string;
}

export class SnapshotSmartPlaylistOp implements CollectionOperation<SnapshotSmartPlaylistInput, number> {
  public readonly repository: PlaylistRepository;

  constructor(repository: PlaylistRepository = new PlaylistRepository()) {
    this.repository = repository;
  }

  public async execute(
    input: SnapshotSmartPlaylistInput,
    ctx: OperationContext
  ): Promise<OperationResult<number>> {
    const { smartPlaylistId, snapshotName } = input;

    // 1. Fetch smart playlist details
    const [smartPlaylist] = await ctx.trx
      .select()
      .from(playlists)
      .where(eq(playlists.id, smartPlaylistId))
      .limit(1);

    if (!smartPlaylist || smartPlaylist.playlistType !== 'smart') {
      throw new Error(`Playlist ${smartPlaylistId} is not a valid smart playlist`);
    }

    // 2. Fetch current entries
    const currentEntries = await ctx.trx
      .select({
        songId: playlistEntries.songId,
        position: playlistEntries.position
      })
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, smartPlaylistId));

    // 3. Create the snapshot playlist
    const [inserted] = await ctx.trx
      .insert(playlists)
      .values({
        name: snapshotName,
        playlistType: 'standard',
        parentId: smartPlaylist.parentId, // Optionally place in same folder
        itemCount: currentEntries.length
      })
      .returning({ id: playlists.id });

    // 4. Copy entries
    if (currentEntries.length > 0) {
      const entriesToInsert = currentEntries.map(e => ({
        playlistId: inserted.id,
        songId: e.songId,
        position: e.position,
        addedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      }));

      await ctx.trx.insert(playlistEntries).values(entriesToInsert);
    }

    return {
      data: inserted.id,
      collectionId: createCollectionId('local', 'playlist', inserted.id),
      operationType: 'playlist.snapshot',
      operationInput: input as unknown as Record<string, unknown>,
      inverseInput: {
        operationType: 'playlist.delete',
        input: { playlistId: inserted.id }
      },
      version: 1,
      affectedSongIds: []
    };
  }
}
