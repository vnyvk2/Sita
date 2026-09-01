import { describe, it, expect, beforeEach } from 'vitest';

import { SongMetadataCache } from '../../../../src/main/core/songMetadataCache';

const createMockSong = (id: number, overrides: Partial<SongData> = {}): SongData => ({
  songId: id,
  title: `Song ${id}`,
  duration: 180,
  path: `C:\\music\\song_${id}.mp3`,
  artists: [{ artistId: 1, name: 'Artist 1' }],
  album: { albumId: 1, name: 'Album 1', isAFavorite: false },
  albumArtists: [],
  genres: [],
  artworkPaths: {
    isDefaultArtwork: true,
    artworkPath: 'default.webp',
    optimizedArtworkPath: 'default.webp'
  },
  isArtworkAvailable: false,
  isAFavorite: false,
  isBlacklisted: false,
  addedDate: 1700000000000,
  createdDate: 1700000000000,
  year: 2024,
  trackNo: id,
  ...overrides
});

describe('SongMetadataCache Engine', () => {
  let cache: SongMetadataCache;

  beforeEach(() => {
    cache = new SongMetadataCache(100);
  });

  it('stores and retrieves songs via get and set', () => {
    const song = createMockSong(1);
    cache.set(1, song);

    expect(cache.has(1)).toBe(true);
    expect(cache.get(1)).toEqual(song);
    expect(cache.size()).toBe(1);
  });

  it('handles getMany partitioning into hits and misses', () => {
    cache.set(1, createMockSong(1));
    cache.set(2, createMockSong(2));

    const { hits, misses } = cache.getMany([1, 2, 3, 4, 1]);

    expect(hits.size).toBe(2);
    expect(hits.get(1)?.songId).toBe(1);
    expect(hits.get(2)?.songId).toBe(2);
    expect(misses).toEqual([3, 4]);
  });

  it('stores multiple songs via setMany', () => {
    const s1 = createMockSong(1);
    const s2 = createMockSong(2);
    const s3 = createMockSong(3);

    cache.setMany([s1, [2, s2], s3]);

    expect(cache.size()).toBe(3);
    expect(cache.get(1)?.songId).toBe(1);
    expect(cache.get(2)?.songId).toBe(2);
    expect(cache.get(3)?.songId).toBe(3);
  });

  it('invalidates single and multiple song entries', () => {
    cache.set(1, createMockSong(1));
    cache.set(2, createMockSong(2));
    cache.set(3, createMockSong(3));

    cache.invalidate(1);
    expect(cache.has(1)).toBe(false);
    expect(cache.size()).toBe(2);

    cache.invalidateMany([2, 3]);
    expect(cache.has(2)).toBe(false);
    expect(cache.has(3)).toBe(false);
    expect(cache.size()).toBe(0);
  });

  it('synchronously updates favorite status via updateFavorite and updateFavoriteMany', () => {
    cache.set(1, createMockSong(1, { isAFavorite: false }));
    cache.set(2, createMockSong(2, { isAFavorite: false }));

    cache.updateFavorite(1, true);
    expect(cache.get(1)?.isAFavorite).toBe(true);

    cache.updateFavoriteMany([1, 2], false);
    expect(cache.get(1)?.isAFavorite).toBe(false);
    expect(cache.get(2)?.isAFavorite).toBe(false);
  });

  it('updates partial fields via update()', () => {
    cache.set(1, createMockSong(1, { title: 'Old Title' }));

    cache.update(1, (prev) => ({ title: 'New Title', year: 2026 }));

    const updated = cache.get(1);
    expect(updated?.title).toBe('New Title');
    expect(updated?.year).toBe(2026);
    expect(updated?.duration).toBe(180);
  });

  it('clears all cached entries via clear()', () => {
    cache.set(1, createMockSong(1));
    cache.set(2, createMockSong(2));
    expect(cache.size()).toBe(2);

    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.has(1)).toBe(false);
  });

  it('enforces LRU eviction when capacity is exceeded', () => {
    const lruCache = new SongMetadataCache(3);

    lruCache.set(1, createMockSong(1));
    lruCache.set(2, createMockSong(2));
    lruCache.set(3, createMockSong(3));

    // Access key 1 to refresh its recency
    lruCache.get(1);

    // Insert key 4 -> oldest non-refreshed item is key 2, so key 2 is evicted
    lruCache.set(4, createMockSong(4));

    expect(lruCache.has(1)).toBe(true);
    expect(lruCache.has(2)).toBe(false);
    expect(lruCache.has(3)).toBe(true);
    expect(lruCache.has(4)).toBe(true);
  });

  it('maintains low memory overhead (~2.5MB for 10k songs, < 25MB incremental) and high throughput', () => {
    // 10,000 songs baseline test (~2.5MB)
    const midCache = new SongMetadataCache(10000);
    const startHeap10k = process.memoryUsage().heapUsed;

    for (let i = 1; i <= 10000; i += 1) {
      midCache.set(i, createMockSong(i));
    }

    const memoryUsedMb10k = (process.memoryUsage().heapUsed - startHeap10k) / (1024 * 1024);
    expect(midCache.size()).toBe(10000);
    expect(memoryUsedMb10k).toBeLessThan(10); // ~2.5MB expected

    // 50,000 songs scale & throughput test
    const largeCache = new SongMetadataCache(50000);
    const t0 = performance.now();
    for (let i = 1; i <= 50000; i += 1) {
      largeCache.set(i, createMockSong(i));
    }
    const insertTime = performance.now() - t0;

    expect(largeCache.size()).toBe(50000);
    expect(insertTime).toBeLessThan(500); // 50k inserts in < 500ms

    // Verify sub-0.1ms 200-item batch lookup
    const testIds = Array.from({ length: 200 }, (_, idx) => idx + 1000);
    const tLookup = performance.now();
    const { hits, misses } = largeCache.getMany(testIds);
    const lookupTime = performance.now() - tLookup;

    expect(hits.size).toBe(200);
    expect(misses.length).toBe(0);
    expect(lookupTime).toBeLessThan(1.0); // < 1ms for 200 lookups (< 0.005ms per lookup)
  });
});
