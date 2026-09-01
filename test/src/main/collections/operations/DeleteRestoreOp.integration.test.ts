import { eq } from 'drizzle-orm';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import {
  BulkDeleteOp,
  BulkRestoreOp
} from '../../../../../src/main/collections/operations/BulkDeleteOp';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { db } from '../../../../../src/main/db/db';
import { playlists, songs, playlistEntries } from '../../../../../src/main/db/schema';

describe('Delete + Restore Integration', () => {
  let repository: PlaylistRepository;
  let deleteOp: BulkDeleteOp;
  let restoreOp: BulkRestoreOp;

  beforeEach(async () => {
    // Clean up
    await db.delete(playlists);

    repository = new PlaylistRepository();
    deleteOp = new BulkDeleteOp(repository);
    restoreOp = new BulkRestoreOp(repository);
  });

  afterEach(async () => {
    await db.delete(playlists);
  });

  it('deletes and restores a deeply nested hierarchy preserving structure', async () => {
    // Root
    const [root] = await db
      .insert(playlists)
      .values({
        name: 'Root',
        playlistType: 'folder',
        parentId: null
      })
      .returning();

    // Folder under Root
    const [folder] = await db
      .insert(playlists)
      .values({
        name: 'Folder',
        playlistType: 'folder',
        parentId: root.id
      })
      .returning();

    // Playlists under Folder
    const [playlist1] = await db
      .insert(playlists)
      .values({
        name: 'Playlist 1',
        playlistType: 'standard',
        parentId: folder.id
      })
      .returning();

    const [playlist2] = await db
      .insert(playlists)
      .values({
        name: 'Playlist 2',
        playlistType: 'standard',
        parentId: folder.id
      })
      .returning();

    // Entries under Playlist 1 - restore must preserve them too
    const seededSongs = await db
      .insert(songs)
      .values(
        ['A', 'B'].map((title) => ({
          title,
          duration: 120.0,
          path: `C:\\music\\delrestore-${title}-${Date.now()}.mp3`,
          fileCreatedAt: new Date(),
          fileModifiedAt: new Date()
        }))
      )
      .returning();
    await db.insert(playlistEntries).values(
      seededSongs.map((s, index) => ({
        playlistId: playlist1.id,
        songId: s.id,
        position: index
      }))
    );

    // Record original state
    const originalPlaylists = await db.select().from(playlists).orderBy(playlists.id);
    const originalEntries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlist1.id))
      .orderBy(playlistEntries.position);

    // Delete Root
    let restoreInverse: any;
    await db.transaction(async (trx) => {
      const ctx = { trx, membershipService: {} as any };
      const res = await deleteOp.execute({ playlistIds: [root.id] }, ctx);
      restoreInverse = res.inverseInput;
    });

    // Verify they are deleted
    const deletedPlaylists = await db.select().from(playlists);
    expect(deletedPlaylists.length).toBe(0);

    // Restore Root
    await db.transaction(async (trx) => {
      const ctx = { trx, membershipService: {} as any };
      await restoreOp.execute(restoreInverse.input, ctx);
    });

    // Verify restored state
    const restoredPlaylists = await db.select().from(playlists).orderBy(playlists.id);

    expect(restoredPlaylists.length).toBe(4);

    // Compare original to restored
    for (let i = 0; i < 4; i++) {
      expect(restoredPlaylists[i].id).toBe(originalPlaylists[i].id);
      expect(restoredPlaylists[i].name).toBe(originalPlaylists[i].name);
      expect(restoredPlaylists[i].parentId).toBe(originalPlaylists[i].parentId);
      expect(restoredPlaylists[i].playlistType).toBe(originalPlaylists[i].playlistType);
    }

    // Verify topological order is preserved
    const hierarchyService = new HierarchyService();
    const originalSorted = hierarchyService.topologicalOrder(originalPlaylists);
    const restoredSorted = hierarchyService.topologicalOrder(restoredPlaylists);

    for (let i = 0; i < 4; i++) {
      expect(restoredSorted[i].id).toBe(originalSorted[i].id);
    }

    // Verify entries survived delete -> restore with identical content
    const restoredEntries = await db
      .select()
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlist1.id))
      .orderBy(playlistEntries.position);

    expect(restoredEntries).toHaveLength(originalEntries.length);
    for (let i = 0; i < originalEntries.length; i++) {
      expect(restoredEntries[i].id).toBe(originalEntries[i].id);
      expect(restoredEntries[i].songId).toBe(originalEntries[i].songId);
      expect(restoredEntries[i].position).toBe(originalEntries[i].position);
    }
  });
});
