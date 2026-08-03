import { describe, expect, it } from 'vitest';

import { MembershipCache } from '@main/membership/cache/MembershipCache';
import type { MembershipEntry } from '@main/membership/models/MembershipEntry';

describe('MembershipCache', () => {
  it('should atomically manage forward and reverse maps and support granular invalidations', () => {
    const cache = new MembershipCache();

    const entries: MembershipEntry[] = [
      { collectionKind: 'playlist', collectionId: 1, memberKind: 'song', memberId: 10, position: 1 },
      { collectionKind: 'playlist', collectionId: 1, memberKind: 'song', memberId: 11, position: 2 }
    ];

    cache.setMembers('playlist', 1, 'song', entries);

    expect(cache.hasMembers('playlist', 1, 'song')).toBe(true);
    const cachedMembers = cache.getMembers('playlist', 1, 'song');
    expect(cachedMembers?.length).toBe(2);

    const collections = cache.getCollectionsContaining('song', 10, 'playlist');
    expect(collections?.length).toBe(1);
    expect(collections?.[0].id).toBe(1);

    // Granular invalidation
    cache.invalidateCollection('playlist', 1);
    expect(cache.hasMembers('playlist', 1, 'song')).toBe(false);
  });
});
