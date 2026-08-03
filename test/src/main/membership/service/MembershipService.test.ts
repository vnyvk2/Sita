import { describe, expect, it, vi } from 'vitest';

import { MembershipCache } from '@main/membership/cache/MembershipCache';
import { MembershipEventBus } from '@main/membership/events/MembershipEventBus';
import type { MembershipEntry } from '@main/membership/models/MembershipEntry';
import type { IMembershipRepository } from '@main/membership/repository/IMembershipRepository';
import { MembershipService } from '@main/membership/service/MembershipService';

describe('MembershipService', () => {
  it('should handle cache misses by querying repository and caching results', async () => {
    const mockEntries: MembershipEntry[] = [
      { collectionKind: 'playlist', collectionId: 5, memberKind: 'song', memberId: 100, position: 1 }
    ];

    const mockRepo: IMembershipRepository = {
      getMembers: vi.fn().mockResolvedValue(mockEntries),
      getCollectionsContaining: vi.fn().mockResolvedValue(mockEntries),
      contains: vi.fn().mockResolvedValue(true),
      containsMany: vi.fn().mockResolvedValue(new Map([[100, true]])),
      countMembers: vi.fn().mockResolvedValue(1),
      getAllCollectionMemberships: vi.fn().mockResolvedValue(mockEntries)
    };

    const cache = new MembershipCache();
    const eventBus = new MembershipEventBus();
    const service = new MembershipService({ repository: mockRepo, cache, eventBus });

    // First call (cache miss -> hits repository)
    const members1 = await service.getMembers({ kind: 'playlist', id: 5 }, 'song');
    expect(mockRepo.getMembers).toHaveBeenCalledTimes(1);
    expect(members1.length).toBe(1);

    // Second call (cache hit -> does NOT hit repository again)
    const members2 = await service.getMembers({ kind: 'playlist', id: 5 }, 'song');
    expect(mockRepo.getMembers).toHaveBeenCalledTimes(1);
    expect(members2.length).toBe(1);
  });
});
