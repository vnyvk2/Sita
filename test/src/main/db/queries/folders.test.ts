import { describe, it, expect, beforeEach } from 'vitest';

import { db, getEngine } from '../../../../../src/main/db/db';
import { getAllMusicFolders } from '../../../../../src/main/db/queries/folders';
import { musicFolders, songs } from '../../../../../src/main/db/schema';

describe('getAllMusicFolders (Flat-Query In-Memory Tree Builder)', () => {
  beforeEach(async () => {
    await db.delete(songs);
    await db.delete(musicFolders);
  });

  it('handles empty database', async () => {
    const result = await getAllMusicFolders();
    expect(result).toEqual([]);
  });

  it('handles a single root folder with songIds, stats, and blacklist preservation', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [root] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        parentId: null,
        isBlacklisted: true,
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    const [song1] = await db
      .insert(songs)
      .values({
        title: 'Song 1',
        duration: 180,
        path: 'C:\\Music\\song1.mp3',
        folderId: root.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [song2] = await db
      .insert(songs)
      .values({
        title: 'Song 2',
        duration: 210,
        path: 'C:\\Music\\song2.mp3',
        folderId: root.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const result = await getAllMusicFolders();
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Music');
    expect(result[0].isBlacklisted).toBe(true);
    expect(result[0].songIds).toEqual(expect.arrayContaining([song1.id, song2.id]));
    expect(result[0].songIds).toHaveLength(2);
    expect(result[0].stats.lastModifiedDate).toEqual(now);
    expect(result[0].stats.lastChangedDate).toEqual(now);
    expect(result[0].stats.fileCreatedDate).toEqual(now);
    expect(result[0].stats.lastParsedDate).toEqual(now);
    expect(result[0].subFolders).toEqual([]);
  });

  it('handles nested hierarchy (Root -> Artist -> Album)', async () => {
    const [root] = await db
      .insert(musicFolders)
      .values({ name: 'Music', path: 'C:\\Music', parentId: null })
      .returning();

    const [artist] = await db
      .insert(musicFolders)
      .values({ name: 'Artist A', path: 'C:\\Music\\Artist A', parentId: root.id })
      .returning();

    const [album] = await db
      .insert(musicFolders)
      .values({ name: 'Album 1', path: 'C:\\Music\\Artist A\\Album 1', parentId: artist.id })
      .returning();

    const [song] = await db
      .insert(songs)
      .values({
        title: 'Track 1',
        duration: 200,
        path: 'C:\\Music\\Artist A\\Album 1\\track1.mp3',
        folderId: album.id,
        fileCreatedAt: new Date(),
        fileModifiedAt: new Date()
      })
      .returning();

    const result = await getAllMusicFolders();
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Music');
    expect(result[0].subFolders).toHaveLength(1);
    expect(result[0].subFolders[0].path).toBe('C:\\Music\\Artist A');
    expect(result[0].subFolders[0].subFolders).toHaveLength(1);
    expect(result[0].subFolders[0].subFolders[0].path).toBe('C:\\Music\\Artist A\\Album 1');
    expect(result[0].subFolders[0].subFolders[0].songIds).toEqual([song.id]);
  });

  it('handles multiple roots with multiple children sharing a parent', async () => {
    const [root1] = await db
      .insert(musicFolders)
      .values({ name: 'Music 1', path: 'D:\\Music1', parentId: null })
      .returning();

    const [root2] = await db
      .insert(musicFolders)
      .values({ name: 'Music 2', path: 'E:\\Music2', parentId: null })
      .returning();

    // Multiple children under root1
    await db.insert(musicFolders).values([
      { name: 'Child 1', path: 'D:\\Music1\\Child 1', parentId: root1.id },
      { name: 'Child 2', path: 'D:\\Music1\\Child 2', parentId: root1.id },
      { name: 'Child 3', path: 'D:\\Music1\\Child 3', parentId: root1.id }
    ]);

    // Multiple children under root2
    await db.insert(musicFolders).values([
      { name: 'Child 2A', path: 'E:\\Music2\\Child 2A', parentId: root2.id },
      { name: 'Child 2B', path: 'E:\\Music2\\Child 2B', parentId: root2.id }
    ]);

    const result = await getAllMusicFolders();
    expect(result).toHaveLength(2);

    const r1 = result.find((r) => r.path === 'D:\\Music1')!;
    const r2 = result.find((r) => r.path === 'E:\\Music2')!;

    expect(r1.subFolders).toHaveLength(3);
    expect(r2.subFolders).toHaveLength(2);
  });

  it('throws an explicit error when an orphaned parentId is detected without corrupting data', async () => {
    // Insert a child folder pointing to a non-existent parentId (e.g. 999999)
    // Disable FK enforcement to simulate corruption (SQLite equivalent of
    // pg's `SET session_replication_role = replica`)
    getEngine()!.exec('PRAGMA foreign_keys = OFF;');
    try {
      await db.insert(musicFolders).values({
        name: 'Orphan Folder',
        path: 'C:\\Music\\Orphan',
        parentId: 999999
      });

      await expect(getAllMusicFolders()).rejects.toThrow(
        "Unable to resolve parent folder ID 999999 for 'C:\\Music\\Orphan'"
      );
    } finally {
      getEngine()!.exec('PRAGMA foreign_keys = ON;');
    }
  });

  it('preserves transaction context when called inside a transaction', async () => {
    await db.transaction(async (trx) => {
      const [folder] = await trx
        .insert(musicFolders)
        .values({
          name: 'Trx Music',
          path: 'C:\\TrxMusic',
          parentId: null
        })
        .returning();

      const result = await getAllMusicFolders(trx);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('C:\\TrxMusic');
    });
  });

  it('correctly builds deep sibling hierarchy (Adele -> 21, 25 and Taylor -> 1989)', async () => {
    const [root] = await db
      .insert(musicFolders)
      .values({ name: 'Music', path: 'C:\\Music', parentId: null })
      .returning();

    const [adele] = await db
      .insert(musicFolders)
      .values({ name: 'Adele', path: 'C:\\Music\\Adele', parentId: root.id })
      .returning();

    const [taylor] = await db
      .insert(musicFolders)
      .values({ name: 'Taylor', path: 'C:\\Music\\Taylor', parentId: root.id })
      .returning();

    await db.insert(musicFolders).values([
      { name: '21', path: 'C:\\Music\\Adele\\21', parentId: adele.id },
      { name: '25', path: 'C:\\Music\\Adele\\25', parentId: adele.id },
      { name: '1989', path: 'C:\\Music\\Taylor\\1989', parentId: taylor.id }
    ]);

    const result = await getAllMusicFolders();
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('C:\\Music');
    expect(result[0].subFolders).toHaveLength(2);

    const adeleNode = result[0].subFolders.find((f) => f.path === 'C:\\Music\\Adele')!;
    const taylorNode = result[0].subFolders.find((f) => f.path === 'C:\\Music\\Taylor')!;

    expect(adeleNode.subFolders).toHaveLength(2);
    expect(adeleNode.subFolders.map((f) => f.path)).toEqual(
      expect.arrayContaining(['C:\\Music\\Adele\\21', 'C:\\Music\\Adele\\25'])
    );

    expect(taylorNode.subFolders).toHaveLength(1);
    expect(taylorNode.subFolders[0].path).toBe('C:\\Music\\Taylor\\1989');
  });

  it('throws an explicit error when a circular parent cycle is detected (A -> B -> A)', async () => {
    getEngine()!.exec('PRAGMA foreign_keys = OFF;');
    try {
      const [folderA] = await db
        .insert(musicFolders)
        .values({ name: 'A', path: 'C:\\A', parentId: null })
        .returning();

      const [folderB] = await db
        .insert(musicFolders)
        .values({ name: 'B', path: 'C:\\B', parentId: folderA.id })
        .returning();

      // Create cycle: A.parentId = B.id, B.parentId = A.id
      getEngine()!.exec(
        `UPDATE music_folders SET parent_id = ${folderB.id} WHERE id = ${folderA.id};`
      );

      await expect(getAllMusicFolders()).rejects.toThrow(
        'Circular parent-child cycle detected in music folders'
      );
    } finally {
      getEngine()!.exec('PRAGMA foreign_keys = ON;');
    }
  });
});
