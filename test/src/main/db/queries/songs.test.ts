import { describe, it, expect, beforeEach } from 'vitest';

import { db } from '../../../../../src/main/db/db';
import { getAllSongs } from '../../../../../src/main/db/queries/songs';
import { musicFolders, songs } from '../../../../../src/main/db/schema';

describe('getAllSongs (Chunking and O(N) Duplicate-Preserving Order)', () => {
  beforeEach(async () => {
    await db.delete(songs);
    await db.delete(musicFolders);
  });

  it('preserves exact duplicate song ID ordering in O(N) time with preserveIdOrder: true', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        parentId: null,
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    const [songA] = await db
      .insert(songs)
      .values({
        title: 'Song A',
        duration: 180,
        path: 'C:\\Music\\songA.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songB] = await db
      .insert(songs)
      .values({
        title: 'Song B',
        duration: 200,
        path: 'C:\\Music\\songB.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songC] = await db
      .insert(songs)
      .values({
        title: 'Song C',
        duration: 220,
        path: 'C:\\Music\\songC.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // Request ordering with multiple duplicates: [A, B, A, C, A]
    const requestedIds = [songA.id, songB.id, songA.id, songC.id, songA.id];
    const res = await getAllSongs({
      songIds: requestedIds,
      preserveIdOrder: true
    });

    expect(res.data).toHaveLength(5);
    expect(res.data.map((s) => s.id)).toEqual([songA.id, songB.id, songA.id, songC.id, songA.id]);
    expect(res.data.map((s) => s.title)).toEqual([
      'Song A',
      'Song B',
      'Song A',
      'Song C',
      'Song A'
    ]);
  });

  it('safely handles > 500 song IDs across chunk boundaries', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        parentId: null,
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    // Create 2 real songs
    const [s1] = await db
      .insert(songs)
      .values({
        title: 'Track 1',
        duration: 100,
        path: 'C:\\Music\\track1.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [s2] = await db
      .insert(songs)
      .values({
        title: 'Track 2',
        duration: 200,
        path: 'C:\\Music\\track2.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // Create a 1,200 ID array repeating s1, s2 spanning multiple 500-ID chunks
    const largeIdArray: number[] = [];
    for (let i = 0; i < 600; i++) {
      largeIdArray.push(s1.id);
      largeIdArray.push(s2.id);
    }

    const res = await getAllSongs({
      songIds: largeIdArray,
      preserveIdOrder: true
    });

    expect(res.data).toHaveLength(1200);
    expect(res.data[0].id).toBe(s1.id);
    expect(res.data[1].id).toBe(s2.id);
    expect(res.data[1198].id).toBe(s1.id);
    expect(res.data[1199].id).toBe(s2.id);
  });

  it('correctly applies sortType and pagination (start/end) when songIds > 500 without preserveIdOrder', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        parentId: null,
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    // Create 6 distinct songs
    const songTitles = ['Zeta', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'];
    const insertedSongs = await db
      .insert(songs)
      .values(
        songTitles.map((title, i) => ({
          title,
          duration: 150,
          path: `C:\\Music\\${title.toLowerCase()}.mp3`,
          folderId: folder.id,
          fileCreatedAt: now,
          fileModifiedAt: now
        }))
      )
      .returning();

    // Repeat IDs to create an array with > 500 items
    const largeIdArray: number[] = [];
    for (let i = 0; i < 100; i++) {
      for (const s of insertedSongs) {
        largeIdArray.push(s.id);
      }
    }
    expect(largeIdArray.length).toBe(600);

    // Query with sortType = 'aToZ', start = 1, end = 4 (should yield ['Beta', 'Delta', 'Epsilon'])
    const res = await getAllSongs({
      songIds: largeIdArray,
      sortType: 'aToZ',
      start: 1,
      end: 4,
      preserveIdOrder: false
    });

    expect(res.data).toHaveLength(3);
    expect(res.data.map((s) => s.title)).toEqual(['Beta', 'Delta', 'Epsilon']);
  });

  it('correctly applies pagination (start/end) when songIds > 500 with preserveIdOrder: true', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        parentId: null,
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    const [s1] = await db
      .insert(songs)
      .values({
        title: 'Song One',
        duration: 100,
        path: 'C:\\Music\\s1.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [s2] = await db
      .insert(songs)
      .values({
        title: 'Song Two',
        duration: 200,
        path: 'C:\\Music\\s2.mp3',
        folderId: folder.id,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const largeIdArray: number[] = [];
    for (let i = 0; i < 300; i++) {
      largeIdArray.push(s1.id);
      largeIdArray.push(s2.id);
    }
    expect(largeIdArray.length).toBe(600);

    // Request start = 10, end = 15 with preserveIdOrder
    const res = await getAllSongs({
      songIds: largeIdArray,
      start: 10,
      end: 15,
      preserveIdOrder: true
    });

    expect(res.data).toHaveLength(5);
    // Index 10 is s1, 11 is s2, 12 is s1, 13 is s2, 14 is s1
    expect(res.data.map((s) => s.id)).toEqual([s1.id, s2.id, s1.id, s2.id, s1.id]);
  });
});
