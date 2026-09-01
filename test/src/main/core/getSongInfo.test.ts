import { db } from '@main/db/db';
import { songs } from '@main/db/schema';
import { inArray } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import getSongInfo from '../../../../src/main/core/getSongInfo';
import songMetadataCache from '../../../../src/main/core/songMetadataCache';

describe('getSongInfo Cache-First Engine & Contract Parity', () => {
  let song1Id: number;
  let song2Id: number;
  let song3Id: number;

  beforeEach(async () => {
    songMetadataCache.clear();

    const now = new Date();
    const inserted = await db
      .insert(songs)
      .values([
        {
          title: 'Beta Song',
          path: 'C:\\music\\beta.mp3',
          duration: 180.0,
          year: 2022,
          trackNumber: 2,
          isFavorite: true,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Alpha Song',
          path: 'C:\\music\\alpha.mp3',
          duration: 240.0,
          year: 2024,
          trackNumber: 1,
          isFavorite: false,
          isBlacklisted: false,
          fileCreatedAt: now,
          fileModifiedAt: now
        },
        {
          title: 'Gamma Blacklisted Song',
          path: 'C:\\music\\gamma.mp3',
          duration: 200.0,
          year: 2020,
          trackNumber: 3,
          isFavorite: true,
          isBlacklisted: true,
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
    songMetadataCache.clear();
    await db.delete(songs).where(inArray(songs.id, [song1Id, song2Id, song3Id]));
  });

  it('populates cache on cold lookup miss and serves subsequent calls directly from cache', async () => {
    expect(songMetadataCache.has(song1Id)).toBe(false);

    // First call: Cold miss -> populates cache
    const firstCall = await getSongInfo([song1Id, song2Id], undefined, undefined, undefined, true);
    expect(firstCall).toHaveLength(2);
    expect(songMetadataCache.has(song1Id)).toBe(true);
    expect(songMetadataCache.has(song2Id)).toBe(true);

    // Second call: Cache hit -> resolves immediately
    const secondCall = await getSongInfo([song2Id, song1Id], undefined, undefined, undefined, true);
    expect(secondCall).toHaveLength(2);
    expect(secondCall[0].songId).toBe(song2Id);
    expect(secondCall[1].songId).toBe(song1Id);
  });

  it('preserves requested ID order and duplicates when preserveIdOrder is true', async () => {
    const requested = [song2Id, song1Id, song2Id, song3Id];
    const results = await getSongInfo(requested, undefined, undefined, undefined, true);

    expect(results.map((s) => s.songId)).toEqual(requested);
  });

  it('filters favorites and non-favorites correctly', async () => {
    const favs = await getSongInfo([song1Id, song2Id, song3Id], undefined, 'favorites');
    expect(favs.map((s) => s.songId)).toEqual(expect.arrayContaining([song1Id, song3Id]));
    expect(favs.find((s) => s.songId === song2Id)).toBeUndefined();

    const nonFavs = await getSongInfo([song1Id, song2Id, song3Id], undefined, 'nonFavorites');
    expect(nonFavs.map((s) => s.songId)).toEqual([song2Id]);
  });

  it('filters blacklisted and whitelisted songs correctly', async () => {
    const blacklisted = await getSongInfo([song1Id, song2Id, song3Id], undefined, 'blacklistedSongs');
    expect(blacklisted.map((s) => s.songId)).toEqual([song3Id]);

    const whitelisted = await getSongInfo([song1Id, song2Id, song3Id], undefined, 'whitelistedSongs');
    expect(whitelisted.map((s) => s.songId)).toEqual(expect.arrayContaining([song1Id, song2Id]));
  });

  it('filters blacklisted songs when noBlacklistedSongs is true', async () => {
    const results = await getSongInfo(
      [song1Id, song2Id, song3Id],
      undefined,
      undefined,
      undefined,
      true,
      true
    );
    expect(results.map((s) => s.songId)).toEqual([song1Id, song2Id]);
  });

  it('applies in-memory sorting when sortType is specified and preserveIdOrder is false', async () => {
    const aToZ = await getSongInfo([song1Id, song2Id], 'aToZ', undefined, undefined, false);
    expect(aToZ.map((s) => s.title)).toEqual(['Alpha Song', 'Beta Song']);

    const zToA = await getSongInfo([song1Id, song2Id], 'zToA', undefined, undefined, false);
    expect(zToA.map((s) => s.title)).toEqual(['Beta Song', 'Alpha Song']);

    const yearAsc = await getSongInfo(
      [song1Id, song2Id],
      'releasedYearAscending',
      undefined,
      undefined,
      false
    );
    expect(yearAsc.map((s) => s.year)).toEqual([2022, 2024]);
  });

  it('respects limit parameter', async () => {
    const results = await getSongInfo([song1Id, song2Id, song3Id], undefined, undefined, 2, true);
    expect(results).toHaveLength(2);
    expect(results.map((s) => s.songId)).toEqual([song1Id, song2Id]);
  });

  it('returns empty array when given empty ID list', async () => {
    const results = await getSongInfo([]);
    expect(results).toEqual([]);
  });
});
