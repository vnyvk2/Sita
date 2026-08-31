import { db } from '@main/db/db';
import { playHistory, songs } from '@main/db/schema';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { clearFullSongHistory, getAllSongsInHistory } from '../history';
import { getHistoryPlaylistWithSongPaths } from '../playlists';

describe('History Queries - Deduplication & Recency Invariants', () => {
  const testSongIds: number[] = [];

  beforeEach(async () => {
    // Clear any existing play history before starting test run
    await clearFullSongHistory();

    const t0 = new Date(Date.now() - 60000);
    const inserted = await db
      .insert(songs)
      .values([
        {
          title: 'Song Alpha',
          path: 'C:\\test\\song_alpha.mp3',
          year: 2021,
          trackNumber: 1,
          isBlacklisted: false,
          isFavorite: false,
          duration: 180.0,
          fileCreatedAt: t0,
          fileModifiedAt: t0,
          createdAt: t0
        },
        {
          title: 'Song Beta',
          path: 'C:\\test\\song_beta.mp3',
          year: 2022,
          trackNumber: 2,
          isBlacklisted: false,
          isFavorite: false,
          duration: 210.0,
          fileCreatedAt: t0,
          fileModifiedAt: t0,
          createdAt: t0
        },
        {
          title: 'Song Gamma',
          path: 'C:\\test\\song_gamma.mp3',
          year: 2023,
          trackNumber: 3,
          isBlacklisted: false,
          isFavorite: false,
          duration: 195.0,
          fileCreatedAt: t0,
          fileModifiedAt: t0,
          createdAt: t0
        }
      ])
      .returning({ id: songs.id });

    for (const song of inserted) {
      testSongIds.push(song.id);
    }
  });

  afterEach(async () => {
    await clearFullSongHistory();
    if (testSongIds.length > 0) {
      await db.delete(songs).where(inArray(songs.id, testSongIds));
    }
    testSongIds.length = 0;
  });

  it('deduplicates multiple plays of the same song and orders by latest playback (addedOrder)', async () => {
    const [songA, songB, songC] = testSongIds;
    const now = Date.now();

    // Playback sequence:
    // 1. Song A played 30 mins ago
    // 2. Song B played 20 mins ago
    // 3. Song A played again 10 mins ago (repeated play)
    // 4. Song C played 5 mins ago
    // 5. Song A played again 1 min ago (repeated play)
    await db.insert(playHistory).values([
      { songId: songA, createdAt: new Date(now - 30 * 60 * 1000) },
      { songId: songB, createdAt: new Date(now - 20 * 60 * 1000) },
      { songId: songA, createdAt: new Date(now - 10 * 60 * 1000) },
      { songId: songC, createdAt: new Date(now - 5 * 60 * 1000) },
      { songId: songA, createdAt: new Date(now - 1 * 60 * 1000) }
    ]);

    const result = await getAllSongsInHistory('addedOrder');

    // Invariant 1: Exactly 3 unique songs returned (no duplicate stacking for Song A)
    expect(result.data).toHaveLength(3);

    // Invariant 2: Song A is at the top (most recently played at -1 min), followed by C (-5 min), then B (-20 min)
    expect(result.data[0].id).toBe(songA);
    expect(result.data[1].id).toBe(songC);
    expect(result.data[2].id).toBe(songB);
  });

  it('deduplicates and orders by first playback when sorting by dateAddedAscending', async () => {
    const [songA, songB, songC] = testSongIds;
    const now = Date.now();

    // Sequence: A (-30m), B (-20m), A (-1m), C (-5m)
    await db.insert(playHistory).values([
      { songId: songA, createdAt: new Date(now - 30 * 60 * 1000) },
      { songId: songB, createdAt: new Date(now - 20 * 60 * 1000) },
      { songId: songA, createdAt: new Date(now - 1 * 60 * 1000) },
      { songId: songC, createdAt: new Date(now - 5 * 60 * 1000) }
    ]);

    const result = await getAllSongsInHistory('dateAddedAscending');

    expect(result.data).toHaveLength(3);
    // In ascending order of first play: A (-30m) -> B (-20m) -> C (-5m)
    expect(result.data[0].id).toBe(songA);
    expect(result.data[1].id).toBe(songB);
    expect(result.data[2].id).toBe(songC);
  });

  it('correctly aggregates most played songs without duplicating entries', async () => {
    const [songA, songB, songC] = testSongIds;
    const now = Date.now();

    // Song A played 3 times, Song B played 1 time, Song C played 2 times
    await db.insert(playHistory).values([
      { songId: songA, createdAt: new Date(now - 40000) },
      { songId: songB, createdAt: new Date(now - 30000) },
      { songId: songC, createdAt: new Date(now - 20000) },
      { songId: songC, createdAt: new Date(now - 15000) },
      { songId: songA, createdAt: new Date(now - 10000) },
      { songId: songA, createdAt: new Date(now - 5000) }
    ]);

    const result = await getAllSongsInHistory('allTimeMostListened');

    expect(result.data).toHaveLength(3);
    // Order: Song A (3 plays) -> Song C (2 plays) -> Song B (1 play)
    expect(result.data[0].id).toBe(songA);
    expect(result.data[1].id).toBe(songC);
    expect(result.data[2].id).toBe(songB);
  });

  it('deduplicates song paths in getHistoryPlaylistWithSongPaths', async () => {
    const [songA, songB] = testSongIds;
    const now = Date.now();

    await db.insert(playHistory).values([
      { songId: songA, createdAt: new Date(now - 20000) },
      { songId: songB, createdAt: new Date(now - 10000) },
      { songId: songA, createdAt: new Date(now - 5000) }
    ]);

    const playlist = await getHistoryPlaylistWithSongPaths();

    // Must return 2 unique song records ordered by latest play (A then B)
    expect(playlist.songs).toHaveLength(2);
    expect(playlist.songs[0].song.path).toBe('C:\\test\\song_alpha.mp3');
    expect(playlist.songs[1].song.path).toBe('C:\\test\\song_beta.mp3');
  });

  it('clears all history entries via clearFullSongHistory', async () => {
    const [songA] = testSongIds;
    await db.insert(playHistory).values([{ songId: songA }]);

    await clearFullSongHistory();

    const result = await getAllSongsInHistory();
    expect(result.data).toHaveLength(0);
  });
});
