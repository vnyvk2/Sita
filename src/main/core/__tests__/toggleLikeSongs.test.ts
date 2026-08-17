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

    expect(dataUpdateEvent).toHaveBeenCalledWith('songs/likes', [song2Id, song1Id, song3Id]);
  });
});
