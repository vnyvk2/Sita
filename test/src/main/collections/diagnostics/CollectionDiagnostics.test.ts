import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { CollectionDiagnostics } from '../../../../../src/main/collections/diagnostics/CollectionDiagnostics';
import { db } from '../../../../../src/main/db/db';
import { playlists } from '../../../../../src/main/db/schema';

describe('CollectionDiagnostics', () => {
  const diagnostics = new CollectionDiagnostics();

  beforeEach(async () => {
    await db.delete(playlists);
  });

  afterEach(async () => {
    await db.delete(playlists);
  });

  it('should find empty folders', async () => {
    const [emptyFolder] = await db
      .insert(playlists)
      .values({ name: 'Empty', playlistType: 'folder' })
      .returning({ id: playlists.id });
    const [fullFolder] = await db
      .insert(playlists)
      .values({ name: 'Full', playlistType: 'folder' })
      .returning({ id: playlists.id });

    // Add child to fullFolder
    await db
      .insert(playlists)
      .values({ name: 'Child', parentId: fullFolder.id, playlistType: 'standard' });

    const emptyFolders = await diagnostics.findEmptyFolders();

    expect(emptyFolders).toContain(emptyFolder.id);
    expect(emptyFolders).not.toContain(fullFolder.id);
  });

  it('should find empty playlists', async () => {
    const [emptyPlaylist] = await db
      .insert(playlists)
      .values({ name: 'Empty', playlistType: 'standard', itemCount: 0 })
      .returning({ id: playlists.id });
    const [fullPlaylist] = await db
      .insert(playlists)
      .values({ name: 'Full', playlistType: 'standard', itemCount: 5 })
      .returning({ id: playlists.id });
    const [emptySmart] = await db
      .insert(playlists)
      .values({ name: 'SmartEmpty', playlistType: 'smart', itemCount: 0 })
      .returning({ id: playlists.id });

    const emptyPlaylists = await diagnostics.findEmptyPlaylists();

    expect(emptyPlaylists).toContain(emptyPlaylist.id);
    expect(emptyPlaylists).toContain(emptySmart.id);
    expect(emptyPlaylists).not.toContain(fullPlaylist.id);
  });

  it('should find duplicate names', async () => {
    const [root1] = await db
      .insert(playlists)
      .values({ name: 'DuplicateName', playlistType: 'standard' })
      .returning({ id: playlists.id });
    const [root2] = await db
      .insert(playlists)
      .values({ name: 'DuplicateName', playlistType: 'folder' })
      .returning({ id: playlists.id });
    await db.insert(playlists).values({ name: 'Unique', playlistType: 'standard' });

    const dupes = await diagnostics.findDuplicateNames(null);
    expect(dupes.length).toBe(1);
    expect(dupes[0].name).toBe('DuplicateName');
    expect(dupes[0].count).toBe(2);
    expect(dupes[0].playlistIds).toContain(root1.id);
    expect(dupes[0].playlistIds).toContain(root2.id);
  });
});
