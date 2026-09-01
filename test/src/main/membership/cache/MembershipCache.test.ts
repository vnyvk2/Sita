import { MembershipCache } from '@main/membership/cache/MembershipCache';
import type { MembershipEntry } from '@main/membership/models/MembershipEntry';
import { describe, expect, it } from 'vitest';

describe('MembershipCache', () => {
  it('should atomically manage forward and reverse maps and support granular invalidations', () => {
    const cache = new MembershipCache();

    const entries: MembershipEntry[] = [
      {
        collectionKind: 'playlist',
        collectionId: 1,
        memberKind: 'song',
        memberId: 10,
        position: 1
      },
      { collectionKind: 'playlist', collectionId: 1, memberKind: 'song', memberId: 11, position: 2 }
    ];

    cache.setMembers('playlist', 1, 'song', entries);

    expect(cache.hasMembers('playlist', 1, 'song')).toBe(true);
    const cachedMembers = cache.getMembers('playlist', 1, 'song');
    expect(cachedMembers?.length).toBe(2);

    const collections = cache.getCollectionsContaining('song', 10, 'playlist');
    expect(collections?.length).toBe(1);
    expect(collections?.[0].id).toBe(1);

    // Granular invalidation cleans forward and reverse
    cache.invalidateCollection('playlist', 1);
    expect(cache.hasMembers('playlist', 1, 'song')).toBe(false);
    expect(cache.getCollectionsContaining('song', 10, 'playlist')).toBeUndefined();
  });

  it('should clean up stale reverse map entries when setMembers replaces a playlist', () => {
    const cache = new MembershipCache();

    // Initial playlist has songs 10, 11, 12
    const initialEntries: MembershipEntry[] = [
      {
        collectionKind: 'playlist',
        collectionId: 100,
        memberKind: 'song',
        memberId: 10,
        position: 1
      },
      {
        collectionKind: 'playlist',
        collectionId: 100,
        memberKind: 'song',
        memberId: 11,
        position: 2
      },
      {
        collectionKind: 'playlist',
        collectionId: 100,
        memberKind: 'song',
        memberId: 12,
        position: 3
      }
    ];
    cache.setMembers('playlist', 100, 'song', initialEntries);

    expect(cache.getCollectionsContaining('song', 12, 'playlist')?.length).toBe(1);

    // Replacement playlist removes song 12
    const updatedEntries: MembershipEntry[] = [
      {
        collectionKind: 'playlist',
        collectionId: 100,
        memberKind: 'song',
        memberId: 10,
        position: 1
      },
      {
        collectionKind: 'playlist',
        collectionId: 100,
        memberKind: 'song',
        memberId: 11,
        position: 2
      }
    ];
    cache.setMembers('playlist', 100, 'song', updatedEntries);

    // Song 12 must no longer be associated with playlist 100
    expect(cache.getCollectionsContaining('song', 12, 'playlist')).toBeUndefined();
  });
});
