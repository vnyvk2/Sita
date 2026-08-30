import { describe, it, expect, beforeEach } from 'vitest';

import getMusicFolderData from '../../../../src/main/core/getMusicFolderData';
import { db } from '../../../../src/main/db/db';
import { musicFolders, songs } from '../../../../src/main/db/schema';

describe('getMusicFolderData', () => {
  beforeEach(async () => {
    await db.delete(songs);
    await db.delete(musicFolders);
  });

  it('returns empty array when database is empty', async () => {
    const result = await getMusicFolderData();
    expect(result).toEqual([]);
  });

  it('returns full tree when folderPaths is empty', async () => {
    const [root] = await db
      .insert(musicFolders)
      .values({ name: 'Music', path: 'C:\\Music', parentId: null })
      .returning();

    const [child] = await db
      .insert(musicFolders)
      .values({ name: 'Artist', path: 'C:\\Music\\Artist', parentId: root.id })
      .returning();

    const result = await getMusicFolderData([]);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Music');
    expect(result[0].subFolders).toHaveLength(1);
    expect(result[0].subFolders[0].path).toBe('C:\\Music\\Artist');
  });

  it('filters specific folderPaths without reloading the tree twice', async () => {
    const [root] = await db
      .insert(musicFolders)
      .values({ name: 'Music', path: 'C:\\Music', parentId: null })
      .returning();

    const [child1] = await db
      .insert(musicFolders)
      .values({ name: 'Artist 1', path: 'C:\\Music\\Artist 1', parentId: root.id })
      .returning();

    const [child2] = await db
      .insert(musicFolders)
      .values({ name: 'Artist 2', path: 'C:\\Music\\Artist 2', parentId: root.id })
      .returning();

    const [song1] = await db
      .insert(songs)
      .values({
        title: 'Song 1',
        duration: 180,
        path: 'C:\\Music\\Artist 1\\song1.mp3',
        folderId: child1.id,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      })
      .returning();

    // Query for Artist 1 only (e.g. from $folderPath.tsx)
    const result = await getMusicFolderData(['C:\\Music\\Artist 1']);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Music\\Artist 1');
    expect(result[0].songIds).toEqual([song1.id]);
  });

  it('applies sorting correctly', async () => {
    const [rootB] = await db
      .insert(musicFolders)
      .values({ name: 'B Music', path: 'C:\\B_Music', parentId: null })
      .returning();

    const [rootA] = await db
      .insert(musicFolders)
      .values({ name: 'A Music', path: 'C:\\A_Music', parentId: null })
      .returning();

    const resultAtoZ = await getMusicFolderData([], 'aToZ');
    expect(resultAtoZ[0].path).toBe('C:\\A_Music');
    expect(resultAtoZ[1].path).toBe('C:\\B_Music');

    const resultZtoA = await getMusicFolderData([], 'zToA');
    expect(resultZtoA[0].path).toBe('C:\\B_Music');
    expect(resultZtoA[1].path).toBe('C:\\A_Music');
  });
});
