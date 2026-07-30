import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../../../src/main/db/db';
import { playlists } from '../../../../../src/main/db/schema';
import { BulkDeleteOp, BulkRestoreOp } from '../../../../../src/main/collections/operations/BulkDeleteOp';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';

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
    const [root] = await db.insert(playlists).values({
      name: 'Root',
      playlistType: 'folder',
      parentId: null
    }).returning();

    // Folder under Root
    const [folder] = await db.insert(playlists).values({
      name: 'Folder',
      playlistType: 'folder',
      parentId: root.id
    }).returning();

    // Playlists under Folder
    const [playlist1] = await db.insert(playlists).values({
      name: 'Playlist 1',
      playlistType: 'standard',
      parentId: folder.id
    }).returning();

    const [playlist2] = await db.insert(playlists).values({
      name: 'Playlist 2',
      playlistType: 'standard',
      parentId: folder.id
    }).returning();

    // Record original state
    const originalPlaylists = await db.select().from(playlists).orderBy(playlists.id);

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
  });
});
