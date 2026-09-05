import { describe, expect, it } from 'vitest';
import {
  SONG_WINDOW_GC_TIME,
  SONG_WINDOW_STALE_TIME,
  songQuery,
  getSongListIdentity
} from '../songs';

describe('songs query layer & cache invariants', () => {
  it('enforces TanStack Query invariant: gcTime >= staleTime to prevent skeleton flash', () => {
    expect(SONG_WINDOW_GC_TIME).toBeGreaterThanOrEqual(SONG_WINDOW_STALE_TIME);
  });

  it('generates deterministic and order-independent cache keys for allSongInfo', () => {
    const queryA = songQuery.allSongInfo({
      songIds: [100, 25, 42, 8],
      sortType: 'aToZ',
      filterType: 'notSelected'
    });

    const queryB = songQuery.allSongInfo({
      songIds: [8, 42, 25, 100], // different order
      sortType: 'aToZ',
      filterType: 'notSelected'
    });

    expect(queryA.queryKey).toEqual(queryB.queryKey);
  });

  it('generates compact cache keys even for large song arrays', () => {
    const largeSongIds = Array.from({ length: 5000 }, (_, i) => i + 1);
    const query = songQuery.allSongInfo({
      songIds: largeSongIds,
      sortType: 'aToZ',
      filterType: 'notSelected'
    });

    const keyString = query.queryKey[2] as string;
    // Key must be compact (less than 50 characters), not thousands of characters
    expect(keyString.length).toBeLessThan(50);
    expect(keyString).toContain(':h=');
    expect(keyString).toContain(':n=5000');
  });

  it('produces distinct hash keys for different ID sets', () => {
    const query1 = songQuery.allSongInfo({
      songIds: [1, 2, 3],
      sortType: 'aToZ'
    });
    const query2 = songQuery.allSongInfo({
      songIds: [1, 2, 4],
      sortType: 'aToZ'
    });

    expect(query1.queryKey[2]).not.toEqual(query2.queryKey[2]);
  });

  it('maintains stable list identity generation', () => {
    expect(getSongListIdentity({ sortType: 'aToZ' })).toBe('ids={"sortType":"aToZ"}');
    expect(getSongListIdentity('ids=test')).toBe('ids=test');
    expect(getSongListIdentity(null)).toBe('ids=default');
  });
});
