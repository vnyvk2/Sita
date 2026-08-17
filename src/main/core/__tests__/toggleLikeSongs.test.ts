import { db } from '@main/db/db';
import { songs } from '@main/db/schema';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { dataUpdateEvent } from '../../main';
import toggleLikeSongs from '../toggleLikeSongs';

vi.mock('../../main', () => ({
  dataUpdateEvent: vi.fn()
}));

vi.mock('../../logger', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

describe('toggleLikeSongs Core Functionality & Contracts', () => {
  let song1Id: number;
  let song2Id: number;
  let song3Id: number;

  beforeEach(async () => {
    vi.clearAllMocks();

    const now = new Date();
    const inserted = await db
      .insert(songs)
      .values([
        {
          title: 'Test Song 1',
          path: 'C:\\test\\song1.mp3',
          duration: '180.00',
          isFavorite: true,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Test Song 2',
          path: 'C:\\test\\song2.mp3',
          duration: '200.00',
          isFavorite: false,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Test Song 3',
          path: 'C:\\test\\song3.mp3',
          duration: '220.00',
          isFavorite: true,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        }
      ])
      .returning({ id: songs.id });

    song1Id = inserted[0].id;
    song2Id = inserted[1].id;
    song3Id = inserted[2].id;
  });

  afterEach(async () => {
    if (song1Id && song2Id && song3Id) {
      await db.delete(songs).where(inArray(songs.id, [song1Id, song2Id, song3Id]));
    }
  });

  it('Explicit True: forces all songs to liked and returns complete likes array', async () => {
    const res = await toggleLikeSongs([song1Id, song2Id, song3Id], true);

    expect(res.likes).toEqual([song1Id, song2Id, song3Id]);
    expect(res.dislikes).toEqual([]);

    const dbRows = await db
      .select({ id: songs.id, isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song1Id, song2Id, song3Id]));

    expect(dbRows.every((r) => r.isFavorite === true)).toBe(true);
    expect(dataUpdateEvent).toHaveBeenCalledTimes(1);
    expect(dataUpdateEvent).toHaveBeenCalledWith('songs/likes', [song1Id, song2Id, song3Id]);
  });

  it('Explicit False: forces all songs to unliked and returns complete dislikes array', async () => {
    const res = await toggleLikeSongs([song1Id, song2Id, song3Id], false);

    expect(res.likes).toEqual([]);
    expect(res.dislikes).toEqual([song1Id, song2Id, song3Id]);

    const dbRows = await db
      .select({ id: songs.id, isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song1Id, song2Id, song3Id]));

    expect(dbRows.every((r) => r.isFavorite === false)).toBe(true);
    expect(dataUpdateEvent).toHaveBeenCalledTimes(1);
    expect(dataUpdateEvent).toHaveBeenCalledWith('songs/likes', [song1Id, song2Id, song3Id]);
  });

  it('Undefined (Toggle): inverts each song individually based on existing DB state', async () => {
    // Initial states: Song 1 = true, Song 2 = false, Song 3 = true
    const res = await toggleLikeSongs([song1Id, song2Id, song3Id]);

    // Expected: Song 2 becomes liked, Songs 1 & 3 become unliked
    expect(res.likes).toEqual([song2Id]);
    expect(res.dislikes).toEqual([song1Id, song3Id]);

    const dbRows = await db
      .select({ id: songs.id, isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song1Id, song2Id, song3Id]));

    const map = new Map(dbRows.map((r) => [r.id, r.isFavorite]));
    expect(map.get(song1Id)).toBe(false);
    expect(map.get(song2Id)).toBe(true);
    expect(map.get(song3Id)).toBe(false);

    expect(dataUpdateEvent).toHaveBeenCalledTimes(1);
    expect(dataUpdateEvent).toHaveBeenCalledWith('songs/likes', [song2Id, song1Id, song3Id]);
  });

  it('Sequential Double Invert: toggles false -> true -> false', async () => {
    // Song 2 starts false
    const res1 = await toggleLikeSongs([song2Id]);
    expect(res1.likes).toEqual([song2Id]);
    expect(res1.dislikes).toEqual([]);

    const [row1] = await db
      .select({ isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song2Id]));
    expect(row1.isFavorite).toBe(true);

    const res2 = await toggleLikeSongs([song2Id]);
    expect(res2.likes).toEqual([]);
    expect(res2.dislikes).toEqual([song2Id]);

    const [row2] = await db
      .select({ isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song2Id]));
    expect(row2.isFavorite).toBe(false);
  });

  it('Concurrent Invert (Same Song): two overlapping toggles atomically invert twice to original state', async () => {
    // Song 2 starts false. Two concurrent toggle requests must invert it twice -> ends false
    await Promise.all([toggleLikeSongs([song2Id]), toggleLikeSongs([song2Id])]);

    const [row] = await db
      .select({ isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song2Id]));

    expect(row.isFavorite).toBe(false);
  });

  it('Concurrent Overlapping Invert: multi-song concurrent requests atomically invert shared and unique tracks', async () => {
    // Reset initial states: Song 1 = false, Song 2 = false, Song 3 = true
    await db
      .update(songs)
      .set({ isFavorite: false })
      .where(inArray(songs.id, [song1Id, song2Id]));
    await db
      .update(songs)
      .set({ isFavorite: true })
      .where(inArray(songs.id, [song3Id]));

    // Request A toggles [1, 2], Request B toggles [2, 3] concurrently
    await Promise.all([toggleLikeSongs([song1Id, song2Id]), toggleLikeSongs([song2Id, song3Id])]);

    const dbRows = await db
      .select({ id: songs.id, isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song1Id, song2Id, song3Id]));

    const map = new Map(dbRows.map((r) => [r.id, r.isFavorite]));
    // Song 1: false -> true (inverted once)
    expect(map.get(song1Id)).toBe(true);
    // Song 2: false -> true -> false (inverted twice by overlapping requests)
    expect(map.get(song2Id)).toBe(false);
    // Song 3: true -> false (inverted once)
    expect(map.get(song3Id)).toBe(false);
  });

  it('Duplicate Input IDs: deduplicates input array and toggles song only once per request', async () => {
    // Song 2 starts false. Passing [song2Id, song2Id, song2Id] should toggle once to true
    const res = await toggleLikeSongs([song2Id, song2Id, song2Id]);

    expect(res.likes).toEqual([song2Id]);
    expect(res.dislikes).toEqual([]);

    const [row] = await db
      .select({ isFavorite: songs.isFavorite })
      .from(songs)
      .where(inArray(songs.id, [song2Id]));

    expect(row.isFavorite).toBe(true);
  });

  it('Empty Input: returns empty result immediately without database transaction or event', async () => {
    const res = await toggleLikeSongs([]);

    expect(res).toEqual({ likes: [], dislikes: [] });
    expect(dataUpdateEvent).not.toHaveBeenCalled();
  });
});
