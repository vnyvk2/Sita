import { db } from '@main/db/db';
import {
  artists,
  artistsSongs,
  albums,
  albumsSongs,
  artworks,
  artworksSongs,
  scrobbleQueue,
  songs
} from '@main/db/schema';
import { inArray, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/main/main', () => ({
  dataUpdateEvent: vi.fn(),
  sendMessageToRenderer: vi.fn()
}));

import getSongInfo from '../../src/main/core/getSongInfo';
import { SongMetadataCache } from '../../src/main/core/songMetadataCache';
import toggleLikeSongs from '../../src/main/core/toggleLikeSongs';
import { getFlatSongsByIds } from '../../src/main/db/queries/songs';

describe('Milestone 1 Adversarial Stress & Edge Case Harness (Challenger 2)', () => {
  const TOTAL_TEST_SONGS = 50;
  const createdSongIds: number[] = [];

  beforeAll(async () => {
    const now = new Date();
    const runId = `adv_${Date.now()}`;

    // Seed songs with varied edge case configurations
    const songInserts = Array.from({ length: TOTAL_TEST_SONGS }, (_, i) => ({
      title: i % 5 === 0 ? `Unicode 🎵 Special & ' " < > ${i}` : `Adversarial Track ${i + 1}`,
      path: `C:\\music\\special_${runId}_${i + 1}.flac`,
      duration: 120 + i,
      year: i % 2 === 0 ? 2024 : null,
      trackNumber: i % 3 === 0 ? i + 1 : null,
      diskNumber: i % 4 === 0 ? 1 : null,
      bitRate: 320,
      sampleRate: 48000,
      noOfChannels: 2,
      language: i % 2 === 0 ? 'en' : null,
      musicBrainzRecordingId: i % 2 === 0 ? `mb-rec-${i}` : null,
      isFavorite: i % 2 === 0,
      isBlacklisted: i % 7 === 0,
      fileCreatedAt: now,
      fileModifiedAt: now
    }));

    const inserted = await db.insert(songs).values(songInserts).returning({ id: songs.id });
    for (const s of inserted) {
      createdSongIds.push(s.id);
    }
  });

  afterAll(async () => {
    if (createdSongIds.length > 0) {
      await db.delete(scrobbleQueue).where(inArray(scrobbleQueue.songId, createdSongIds));
      await db.delete(songs).where(inArray(songs.id, createdSongIds));
    }
  });

  it('Stress Test: High LRU thrashing with capacity=5 across 50 songs with 200 concurrent requests', async () => {
    const tinyCache = new SongMetadataCache(5);

    // Concurrently populate and query tiny cache
    const tasks: Promise<unknown>[] = [];
    for (let i = 0; i < 200; i++) {
      const randomIds = Array.from(
        { length: 8 },
        () => createdSongIds[Math.floor(Math.random() * createdSongIds.length)]
      );
      tasks.push(
        (async () => {
          const { misses } = tinyCache.getMany(randomIds);
          if (misses.length > 0) {
            const fetched = await getFlatSongsByIds(misses);
            tinyCache.setMany(fetched);
          }
          const results = randomIds.map((id) => tinyCache.get(id)).filter(Boolean);
          expect(results.length).toBeGreaterThan(0);
          expect(tinyCache.size()).toBeLessThanOrEqual(5);
        })()
      );
    }

    await Promise.all(tasks);
    expect(tinyCache.size()).toBeLessThanOrEqual(5);
  });

  it('Edge Case: getSongInfo safely handles negative, NaN, floating point, and extreme IDs', async () => {
    const mixedIds = [-1, NaN, 0, 99999999, createdSongIds[0], 1.5, createdSongIds[1]];

    const results = await getSongInfo(mixedIds, undefined, undefined, undefined, true);

    expect(results).toHaveLength(2);
    expect(results.map((s) => s.songId)).toEqual([createdSongIds[0], createdSongIds[1]]);
  });

  it('Edge Case: Inverting favorites on empty and single-element arrays', async () => {
    const emptyResult = await toggleLikeSongs([]);
    expect(emptyResult).toEqual({ likes: [], dislikes: [] });

    const singleId = createdSongIds[2];
    const initialFavorite = (
      await db.select({ isFav: songs.isFavorite }).from(songs).where(eq(songs.id, singleId))
    )[0].isFav;

    const res = await toggleLikeSongs([singleId]);
    if (initialFavorite) {
      expect(res.dislikes).toEqual([singleId]);
      expect(res.likes).toEqual([]);
    } else {
      expect(res.likes).toEqual([singleId]);
      expect(res.dislikes).toEqual([]);
    }
  });

  it('Data Parity: Flat SQL row projection matches all fields without undefined corruption', async () => {
    const flatRows = await getFlatSongsByIds(createdSongIds.slice(0, 10), true);

    expect(flatRows).toHaveLength(10);
    for (const song of flatRows) {
      expect(typeof song.songId).toBe('number');
      expect(typeof song.title).toBe('string');
      expect(typeof song.duration).toBe('number');
      expect(typeof song.isAFavorite).toBe('boolean');
      expect(typeof song.isBlacklisted).toBe('boolean');
      expect(Array.isArray(song.artists)).toBe(true);
      expect(Array.isArray(song.genres)).toBe(true);
      expect(song.artworkPaths).toBeDefined();
    }
  });
});
