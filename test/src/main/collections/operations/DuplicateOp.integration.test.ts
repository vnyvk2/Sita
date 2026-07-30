import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { db } from '../../../../../src/main/db/db';
import { playlists } from '../../../../../src/main/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { DuplicateOp } from '../../../../../src/main/collections/operations/DuplicateOp';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';

describe('DuplicateOp Integration', () => {
  let repository: PlaylistRepository;
  let duplicateOp: DuplicateOp;

  beforeEach(async () => {
    // Clean up
    await db.delete(playlists);
    
    repository = new PlaylistRepository();
    duplicateOp = new DuplicateOp(repository);
  });

  afterEach(async () => {
    await db.delete(playlists);
  });

  it('duplicates a deeply nested folder structure identically', async () => {
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

    // Playlist under Folder
    const [playlist] = await db.insert(playlists).values({
      name: 'Playlist',
      playlistType: 'standard',
      parentId: folder.id
    }).returning();

    // Duplicate Root
    let newRootId: number = -1;
    await db.transaction(async (trx) => {
      const ctx = { trx, membershipService: {} as any };
      const res = await duplicateOp.execute({ playlistId: root.id }, ctx);
      // The DuplicateOp returns the ID of the new root node in the newId mapping, or we can look it up
      // In this setup, we just fetch all playlists since db is cleared beforehand.
    });

    const allPlaylists = await db.select().from(playlists).orderBy(playlists.id);
    
    // We expect 6 playlists total (3 original, 3 duplicated)
    expect(allPlaylists.length).toBe(6);

    const rootCopy = allPlaylists.find(p => p.name === 'Root (Copy)');
    expect(rootCopy).toBeDefined();
    expect(rootCopy?.parentId).toBeNull();
    
    const folderCopy = allPlaylists.find(p => p.name === 'Folder' && p.parentId === rootCopy?.id);
    expect(folderCopy).toBeDefined();
    
    const playlistCopy = allPlaylists.find(p => p.name === 'Playlist' && p.parentId === folderCopy?.id);
    expect(playlistCopy).toBeDefined();
    expect(playlistCopy?.playlistType).toBe('standard');
  });
});
