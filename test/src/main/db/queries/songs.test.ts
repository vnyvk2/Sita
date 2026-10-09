import { describe, it, expect, beforeEach } from 'vitest';

import { db } from '../../../../../src/main/db/db';
import { getAllSongs, getFilteredSongLibraryIds } from '../../../../../src/main/db/queries/songs';
import { genres, genresSongs, musicFolders, songs } from '../../../../../src/main/db/schema';

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

describe('getFilteredSongLibraryIds Filter Composition & Extensions', () => {
  beforeEach(async () => {
    await db.delete(genresSongs);
    await db.delete(genres);
    await db.delete(songs);
    await db.delete(musicFolders);
  });

  it('correctly composes restrictToIds with filterType: favorites in a single query', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
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
        duration: 100,
        path: 'C:\\Music\\s1.mp3',
        folderId: folder.id,
        isFavorite: true,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [song2] = await db
      .insert(songs)
      .values({
        title: 'Song 2',
        duration: 120,
        path: 'C:\\Music\\s2.mp3',
        folderId: folder.id,
        isFavorite: false,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [song3] = await db
      .insert(songs)
      .values({
        title: 'Song 3',
        duration: 150,
        path: 'C:\\Music\\s3.mp3',
        folderId: folder.id,
        isFavorite: true,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    // Restricting to song1 and song2, but filtering by favorites
    const res = await getFilteredSongLibraryIds({
      restrictToIds: [song1.id, song2.id],
      filterType: 'favorites'
    });

    // Only song1 matches both restrictToIds AND isFavorite: true
    expect(res.ids).toEqual([song1.id]);
    expect(res.total).toBe(1);
  });

  it('correctly composes genre with filterType: favorites in a single query', async () => {
    const now = new Date('2026-01-01T12:00:00Z');
    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    const [rock] = await db
      .insert(genres)
      .values({
        name: 'Rock',
        artworkPaths: { artworkPath: '', optimizedArtworkPath: '', isDefaultArtwork: true }
      })
      .returning();

    const [jazz] = await db
      .insert(genres)
      .values({
        name: 'Jazz',
        artworkPaths: { artworkPath: '', optimizedArtworkPath: '', isDefaultArtwork: true }
      })
      .returning();

    const [songA] = await db
      .insert(songs)
      .values({
        title: 'Rock Favorite',
        duration: 200,
        path: 'C:\\Music\\rockFav.mp3',
        folderId: folder.id,
        isFavorite: true,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songB] = await db
      .insert(songs)
      .values({
        title: 'Rock Non-Favorite',
        duration: 210,
        path: 'C:\\Music\\rockNonFav.mp3',
        folderId: folder.id,
        isFavorite: false,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [songC] = await db
      .insert(songs)
      .values({
        title: 'Jazz Favorite',
        duration: 180,
        path: 'C:\\Music\\jazzFav.mp3',
        folderId: folder.id,
        isFavorite: true,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    await db.insert(genresSongs).values([
      { genreId: rock.id, songId: songA.id },
      { genreId: rock.id, songId: songB.id },
      { genreId: jazz.id, songId: songC.id }
    ]);

    // Query genre 'Rock' + filterType 'favorites'
    const res = await getFilteredSongLibraryIds({
      genre: 'Rock',
      filterType: 'favorites'
    });

    expect(res.ids).toEqual([songA.id]);
    expect(res.total).toBe(1);
  });

  it('filters by recentlyAddedPeriod cutoff date and safely handles period: all', async () => {
    const now = new Date();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

    const [folder] = await db
      .insert(musicFolders)
      .values({
        name: 'Music',
        path: 'C:\\Music',
        folderCreatedAt: now,
        lastModifiedAt: now,
        lastChangedAt: now,
        lastParsedAt: now
      })
      .returning();

    const [recentSong] = await db
      .insert(songs)
      .values({
        title: 'A Recent Song',
        duration: 180,
        path: 'C:\\Music\\recent.mp3',
        folderId: folder.id,
        createdAt: now,
        fileCreatedAt: now,
        fileModifiedAt: now
      })
      .returning();

    const [oldSong] = await db
      .insert(songs)
      .values({
        title: 'Z Old Song',
        duration: 200,
        path: 'C:\\Music\\old.mp3',
        folderId: folder.id,
        createdAt: tenDaysAgo,
        fileCreatedAt: tenDaysAgo,
        fileModifiedAt: tenDaysAgo
      })
      .returning();

    // 7-day cutoff should include only recentSong
    const res7d = await getFilteredSongLibraryIds({
      recentlyAddedPeriod: '7d'
    });
    expect(res7d.ids).toEqual([recentSong.id]);
    expect(res7d.total).toBe(1);

    // period: 'all' (All Time) should return both without throwing
    const resAll = await getFilteredSongLibraryIds({
      recentlyAddedPeriod: 'all',
      sortType: 'aToZ'
    });
    expect(resAll.ids).toEqual([recentSong.id, oldSong.id]);
    expect(resAll.total).toBe(2);
  });
});
