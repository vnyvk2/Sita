import { eq, inArray } from 'drizzle-orm';

import { HierarchyService } from '../../../../../src/main/collections/engine/HierarchyService';
import { DuplicateExecutor } from '../../../../../src/main/collections/operations/DuplicateExecutor';
import { DuplicateOp } from '../../../../../src/main/collections/operations/DuplicateOp';
import { DuplicatePlanner } from '../../../../../src/main/collections/operations/DuplicatePlanner';
import { PlaylistRepository } from '../../../../../src/main/collections/repositories/PlaylistRepository';
import { db } from '../../../../../src/main/db/db';
import { playlists, smartPlaylistRules } from '../../../../../src/main/db/schema';

describe('DuplicateOp Integration', () => {
  let repository: PlaylistRepository;
  let hierarchyService: HierarchyService;
  let duplicateOp: DuplicateOp;

  beforeEach(async () => {
    // Clean up
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);

    repository = new PlaylistRepository();
    hierarchyService = new HierarchyService();
    duplicateOp = new DuplicateOp(new DuplicatePlanner(hierarchyService), new DuplicateExecutor());
  });

  afterEach(async () => {
    await db.delete(smartPlaylistRules);
    await db.delete(playlists);
  });

  it('duplicates a deeply nested folder structure identically', async () => {
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

    // Playlist under Folder
    const [playlist] = await db
      .insert(playlists)
      .values({
        name: 'Playlist',
        playlistType: 'standard',
        parentId: folder.id
      })
      .returning();

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

    const rootCopy = allPlaylists.find((p) => p.name === 'Root (Copy)');
    expect(rootCopy).toBeDefined();
    expect(rootCopy?.parentId).toBeNull();

    const folderCopy = allPlaylists.find((p) => p.name === 'Folder' && p.parentId === rootCopy?.id);
    expect(folderCopy).toBeDefined();

    const playlistCopy = allPlaylists.find(
      (p) => p.name === 'Playlist' && p.parentId === folderCopy?.id
    );
    expect(playlistCopy).toBeDefined();
    expect(playlistCopy?.playlistType).toBe('standard');

    // Verify parent IDs are remapped correctly and no duplicated node still references an original parent
    const originalIds = new Set([root.id, folder.id, playlist.id]);
    const duplicatedNodes = [rootCopy!, folderCopy!, playlistCopy!];

    for (const node of duplicatedNodes) {
      expect(originalIds.has(node.id)).toBe(false); // Should have a new ID
      if (node.parentId !== null) {
        expect(originalIds.has(node.parentId)).toBe(false); // Should not reference an original parent
      }
    }
  });

  it('duplicates a smart playlist and its rules without PK collision', async () => {
    const [smartPl] = await db
      .insert(playlists)
      .values({
        name: 'My Smart Playlist',
        playlistType: 'smart',
        parentId: null
      })
      .returning();

    await db.insert(smartPlaylistRules).values({
      playlistId: smartPl.id,
      ruleAst: {
        type: 'group',
        logicalOperator: 'and',
        rules: [{ type: 'condition', field: 'title', operator: 'contains', value: 'rock' }]
      },
      sortDefinition: [{ field: 'addedAt', direction: 'desc' }],
      maxEntries: 25,
      dependencies: ['title'],
      ruleVersion: 1
    });

    await db.transaction(async (trx) => {
      const ctx = { trx, membershipService: {} as any };
      await duplicateOp.execute({ playlistId: smartPl.id }, ctx);
    });

    const allPlaylists = await db.select().from(playlists).orderBy(playlists.id);
    expect(allPlaylists.length).toBe(2);

    const copyPl = allPlaylists.find((p) => p.name === 'My Smart Playlist (Copy)');
    expect(copyPl).toBeDefined();
    expect(copyPl?.playlistType).toBe('smart');

    const copyRules = await db
      .select()
      .from(smartPlaylistRules)
      .where(eq(smartPlaylistRules.playlistId, copyPl!.id));
    expect(copyRules.length).toBe(1);
    expect(copyRules[0].playlistId).toBe(copyPl!.id);
    expect(copyRules[0].id).not.toBe(smartPl.id);
    expect(copyRules[0].maxEntries).toBe(25);
  });
});
