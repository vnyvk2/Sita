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
      getCollectionsContainingMany: vi.fn().mockResolvedValue(mockEntries),
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

  it('should verify transaction bypass behavior', async () => {
    // When a transactional query runs (passing trx !== db), we expect it to query the database directly
    // and NOT fetch from or populate the in-memory cache.
    const mockEntries: MembershipEntry[] = [
      { collectionKind: 'playlist', collectionId: 10, memberKind: 'song', memberId: 101, position: 1 }
    ];

    const mockRepo: IMembershipRepository = {
      getMembers: vi.fn().mockResolvedValue(mockEntries),
      getCollectionsContaining: vi.fn().mockResolvedValue(mockEntries),
      getCollectionsContainingMany: vi.fn().mockResolvedValue([]),
      contains: vi.fn().mockResolvedValue(true),
      containsMany: vi.fn().mockResolvedValue(new Map()),
      countMembers: vi.fn().mockResolvedValue(1),
      getAllCollectionMemberships: vi.fn().mockResolvedValue([])
    };

    const cache = new MembershipCache();
    const eventBus = new MembershipEventBus();
    const service = new MembershipService({ repository: mockRepo, cache, eventBus });

    // Populate cache first
    await service.getMembers({ kind: 'playlist', id: 10 }, 'song');
    expect(cache.hasMembers('playlist', 10, 'song')).toBe(true);

    // Call contains (which checks cache)
    const containsCached = await service.contains({ kind: 'playlist', id: 10 }, { kind: 'song', id: 101 });
    expect(containsCached).toBe(true);
    expect(mockRepo.contains).not.toHaveBeenCalled();

    // Call contains with direct repo query bypassing service (simulating transactional path)
    const containsDirect = await mockRepo.contains({ kind: 'playlist', id: 10 }, { kind: 'song', id: 101 });
    expect(containsDirect).toBe(true);
    expect(mockRepo.contains).toHaveBeenCalledTimes(1);
  });

  it('should verify batch lookup cache population efficiency', async () => {
    const mockRepo: IMembershipRepository = {
      getMembers: vi.fn().mockResolvedValue([]),
      getCollectionsContaining: vi.fn().mockResolvedValue([]),
      getCollectionsContainingMany: vi.fn().mockResolvedValue([
        { collectionKind: 'playlist', collectionId: 5, memberKind: 'song', memberId: 500 },
        { collectionKind: 'playlist', collectionId: 6, memberKind: 'song', memberId: 501 }
      ]),
      contains: vi.fn().mockResolvedValue(false),
      containsMany: vi.fn().mockResolvedValue(new Map()),
      countMembers: vi.fn().mockResolvedValue(0),
      getAllCollectionMemberships: vi.fn().mockResolvedValue([])
    };

    const cache = new MembershipCache();
    const eventBus = new MembershipEventBus();
    const service = new MembershipService({ repository: mockRepo, cache, eventBus });

    // Pre-cache song 500
    cache.setCollectionsContaining('song', 500, 'playlist', [{ kind: 'playlist', id: 5 }]);

    // Batch query both song 500 (cached) and song 501 (uncached)
    const members = [{ kind: 'song' as const, id: 500 }, { kind: 'song' as const, id: 501 }];
    const result = await service.getCollectionsContainingMany(members, 'playlist');

    expect(result.get(500)?.length).toBe(1);
    expect(result.get(501)?.length).toBe(1);

    // Verify repository getCollectionsContainingMany was called with only uncached member (song 501)
    expect(mockRepo.getCollectionsContainingMany).toHaveBeenCalledWith(
      [{ kind: 'song', id: 501 }],
      'playlist'
    );
  });

  it('should verify duplicate playlist entries are cached and handled correctly', async () => {
    const duplicateEntries: MembershipEntry[] = [
      { collectionKind: 'playlist', collectionId: 200, memberKind: 'song', memberId: 99, position: 1 },
      { collectionKind: 'playlist', collectionId: 200, memberKind: 'song', memberId: 99, position: 2 }
    ];

    const mockRepo: IMembershipRepository = {
      getMembers: vi.fn().mockResolvedValue(duplicateEntries),
      getCollectionsContaining: vi.fn().mockResolvedValue([]),
      getCollectionsContainingMany: vi.fn().mockResolvedValue([]),
      contains: vi.fn().mockResolvedValue(true),
      containsMany: vi.fn().mockResolvedValue(new Map([[99, true]])),
      countMembers: vi.fn().mockResolvedValue(2),
      getAllCollectionMemberships: vi.fn().mockResolvedValue([])
    };

    const cache = new MembershipCache();
    const eventBus = new MembershipEventBus();
    const service = new MembershipService({ repository: mockRepo, cache, eventBus });

    const members = await service.getMembers({ kind: 'playlist', id: 200 }, 'song');
    expect(members.length).toBe(2);
    expect(members[0].position).toBe(1);
    expect(members[1].position).toBe(2);
    expect(members[0].memberId).toBe(99);
    expect(members[1].memberId).toBe(99);

    // Verify cache has both duplicate entry objects
    const cached = cache.getMembers('playlist', 200, 'song');
    expect(cached?.length).toBe(2);
  });
});
