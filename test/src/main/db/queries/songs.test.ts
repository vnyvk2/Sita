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

  it('filters by recentlyAddedPeriod cutoff date and safely handles period: all across all periods', async () => {
    const now = new Date();
    // Midnight of today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Song created today
    const songToday = new Date(startOfToday.getTime() + 2 * 60 * 60 * 1000); // 2 hours after midnight today
    // Song created yesterday 2 hours before midnight (e.g. 10 hours ago if now is 8 AM, but yesterday's calendar day)
    const songYesterday = new Date(startOfToday.getTime() - 2 * 60 * 60 * 1000);
    // Song 5 days ago
    const song5d = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    // Song 20 days ago
    const song20d = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    // Song 60 days ago
    const song60d = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    // Song 200 days ago
    const song200d = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000);
    // Song 400 days ago
    const song400d = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

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

    const insertSong = async (title: string, createdAt: Date) => {
      const [s] = await db
        .insert(songs)
        .values({
          title,
          duration: 180,
          path: `C:\\Music\\${title.replace(/\s+/g, '_')}.mp3`,
          folderId: folder.id,
          createdAt,
          fileCreatedAt: createdAt,
          fileModifiedAt: createdAt
        })
        .returning();
      return s;
    };

    const sToday = await insertSong('Song Today', songToday);
    const sYesterday = await insertSong('Song Yesterday', songYesterday);
    const s5d = await insertSong('Song 5d', song5d);
    const s20d = await insertSong('Song 20d', song20d);
    const s60d = await insertSong('Song 60d', song60d);
    const s200d = await insertSong('Song 200d', song200d);
    const s400d = await insertSong('Song 400d', song400d);

    // 1. 'today' calendar-day semantics: strictly excludes songYesterday even if close in time
    const resToday = await getFilteredSongLibraryIds({ recentlyAddedPeriod: 'today' });
    expect(resToday.ids).toContain(sToday.id);
    expect(resToday.ids).not.toContain(sYesterday.id);
    expect(resToday.ids).not.toContain(s5d.id);

    // 2. '7d': includes today, yesterday, and 5d
    const res7d = await getFilteredSongLibraryIds({ recentlyAddedPeriod: '7d' });
    expect(res7d.ids).toContain(sToday.id);
    expect(res7d.ids).toContain(sYesterday.id);
    expect(res7d.ids).toContain(s5d.id);
    expect(res7d.ids).not.toContain(s20d.id);

    // 3. '30d': includes up to 20d, excludes 60d
    const res30d = await getFilteredSongLibraryIds({ recentlyAddedPeriod: '30d' });
    expect(res30d.ids).toContain(s20d.id);
    expect(res30d.ids).not.toContain(s60d.id);

    // 4. '90d': includes up to 60d, excludes 200d
    const res90d = await getFilteredSongLibraryIds({ recentlyAddedPeriod: '90d' });
    expect(res90d.ids).toContain(s60d.id);
    expect(res90d.ids).not.toContain(s200d.id);

    // 5. '365d': includes up to 200d, excludes 400d
    const res365d = await getFilteredSongLibraryIds({ recentlyAddedPeriod: '365d' });
    expect(res365d.ids).toContain(s200d.id);
    expect(res365d.ids).not.toContain(s400d.id);

    // 6. 'all': returns all songs
    const resAll = await getFilteredSongLibraryIds({ recentlyAddedPeriod: 'all', sortType: 'aToZ' });
    expect(resAll.ids).toContain(sToday.id);
    expect(resAll.ids).toContain(sYesterday.id);
    expect(resAll.ids).toContain(s5d.id);
    expect(resAll.ids).toContain(s20d.id);
    expect(resAll.ids).toContain(s60d.id);
    expect(resAll.ids).toContain(s200d.id);
    expect(resAll.ids).toContain(s400d.id);
    expect(resAll.total).toBe(7);
  });

  it('returns empty result when restrictToIds is explicitly empty array', async () => {
    const res = await getFilteredSongLibraryIds({ restrictToIds: [] });
    expect(res.ids).toEqual([]);
    expect(res.total).toBe(0);
    expect(res.blacklistedIds).toEqual([]);
  });
});
