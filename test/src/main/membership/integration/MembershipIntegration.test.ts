import { describe, expect, it, vi } from 'vitest';

import { MembershipCache } from '@main/membership/cache/MembershipCache';
import { MembershipEventBus } from '@main/membership/events/MembershipEventBus';
import type { MembershipEntry } from '@main/membership/models/MembershipEntry';
import type { IMembershipRepository } from '@main/membership/repository/IMembershipRepository';
import { MembershipService } from '@main/membership/service/MembershipService';

describe('MembershipIntegration', () => {
  it('should verify Repository -> Cache -> Service -> EventBus pipeline', async () => {
    const mockEntries: MembershipEntry[] = [
      { collectionKind: 'playlist', collectionId: 42, memberKind: 'song', memberId: 777, position: 1 }
    ];

    const mockRepo: IMembershipRepository = {
      getMembers: vi.fn().mockResolvedValue(mockEntries),
      getCollectionsContaining: vi.fn().mockResolvedValue(mockEntries),
      contains: vi.fn().mockResolvedValue(true),
      containsMany: vi.fn().mockResolvedValue(new Map([[777, true]])),
      countMembers: vi.fn().mockResolvedValue(1),
      getAllCollectionMemberships: vi.fn().mockResolvedValue(mockEntries)
    };

    const cache = new MembershipCache();
    const eventBus = new MembershipEventBus();
    const service = new MembershipService({ repository: mockRepo, cache, eventBus });

    // 1. Initial query populates cache from repository
    const membersInitial = await service.getMembers({ kind: 'playlist', id: 42 }, 'song');
    expect(membersInitial.length).toBe(1);
    expect(cache.hasMembers('playlist', 42, 'song')).toBe(true);

    // 2. Event notification invalidates only affected collection in cache
    service.notifyMembershipChanged({
      type: 'added',
      collection: { kind: 'playlist', id: 42 },
      memberKind: 'song',
      members: [{ kind: 'song', id: 777 }]
    });

    expect(cache.hasMembers('playlist', 42, 'song')).toBe(false);

    // 3. Re-query re-fetches updated state from repository
    await service.getMembers({ kind: 'playlist', id: 42 }, 'song');
    expect(mockRepo.getMembers).toHaveBeenCalledTimes(2);
  });
});
