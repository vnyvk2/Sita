import type { MembershipCache } from '../cache/MembershipCache';
import type { MembershipChangedPayload, MembershipEventBus } from '../events/MembershipEventBus';
import type { MembershipEntry } from '../models/MembershipEntry';
import type { MembershipEntityKind, MembershipReference } from '../models/MembershipReference';
import type { IMembershipRepository } from '../repository/IMembershipRepository';

export interface MembershipServiceOptions {
  repository: IMembershipRepository;
  cache: MembershipCache;
  eventBus: MembershipEventBus;
}

export class MembershipService {
  private readonly repository: IMembershipRepository;
  private readonly cache: MembershipCache;
  private readonly eventBus: MembershipEventBus;

  constructor(options: MembershipServiceOptions) {
    this.repository = options.repository;
    this.cache = options.cache;
    this.eventBus = options.eventBus;

    // Listen for membership mutation events for granular cache invalidation
    this.eventBus.onMembershipChanged((payload) => this.handleMembershipChanged(payload));
  }

  /**
   * Returns members in a collection. $O(1)$ on cache hit; loads from repository on cache miss.
   */
  public async getMembers(
    collection: MembershipReference,
    memberKind: MembershipEntityKind = 'song'
  ): Promise<MembershipEntry[]> {
    const cached = this.cache.getMembers(collection.kind, collection.id, memberKind);
    if (cached !== undefined) {
      return cached;
    }

    const entries = await this.repository.getMembers(collection, memberKind);
    this.cache.setMembers(collection.kind, collection.id, memberKind, entries);
    return entries;
  }

  /**
   * Returns collections containing a member. $O(1)$ on cache hit; loads from repository on cache miss.
   */
  public async getCollectionsContaining(
    member: MembershipReference,
    collectionKind: MembershipEntityKind
  ): Promise<MembershipReference[]> {
    const cached = this.cache.getCollectionsContaining(member.kind, member.id, collectionKind);
    if (cached !== undefined) {
      return cached;
    }

    const entries = await this.repository.getCollectionsContaining(member, collectionKind);
    const collections: MembershipReference[] = entries.map((e) => ({
      kind: e.collectionKind,
      id: e.collectionId
    }));

    this.cache.setCollectionsContaining(member.kind, member.id, collectionKind, collections);
    return collections;
  }

  /**
   * Checks if a collection contains a specific member.
   */
  public async contains(
    collection: MembershipReference,
    member: MembershipReference
  ): Promise<boolean> {
    const cachedMembers = this.cache.getMembers(collection.kind, collection.id, member.kind);
    if (cachedMembers !== undefined) {
      return cachedMembers.some((e) => String(e.memberId) === String(member.id));
    }

    return this.repository.contains(collection, member);
  }

  /**
   * Checks containment for multiple members in a collection.
   */
  public async containsMany(
    collection: MembershipReference,
    members: MembershipReference[]
  ): Promise<Map<string | number, boolean>> {
    const cachedMembers = this.cache.getMembers(
      collection.kind,
      collection.id,
      members[0]?.kind ?? 'song'
    );

    if (cachedMembers !== undefined) {
      const memberSet = new Set(cachedMembers.map((e) => String(e.memberId)));
      const resultMap = new Map<string | number, boolean>();
      for (const m of members) {
        resultMap.set(m.id, memberSet.has(String(m.id)));
      }
      return resultMap;
    }

    return this.repository.containsMany(collection, members);
  }

  /**
   * Returns total member count in a collection.
   */
  public async countMembers(
    collection: MembershipReference,
    memberKind: MembershipEntityKind = 'song'
  ): Promise<number> {
    const cachedMembers = this.cache.getMembers(collection.kind, collection.id, memberKind);
    if (cachedMembers !== undefined) {
      return cachedMembers.length;
    }

    return this.repository.countMembers(collection, memberKind);
  }

  /**
   * Pre-warms cache for all memberships of a specified member kind.
   */
  public async warmCache(memberKind: MembershipEntityKind = 'song'): Promise<void> {
    const allEntries = await this.repository.getAllCollectionMemberships(memberKind);

    // Group by "collectionKind:collectionId"
    const collectionGroups = new Map<string, MembershipEntry[]>();
    for (const entry of allEntries) {
      const groupKey = `${entry.collectionKind}:${entry.collectionId}:${entry.memberKind}`;
      const list = collectionGroups.get(groupKey) ?? [];
      list.push(entry);
      collectionGroups.set(groupKey, list);
    }

    for (const [key, entries] of collectionGroups.entries()) {
      const [colKind, colId, memKind] = key.split(':');
      this.cache.setMembers(
        colKind as MembershipEntityKind,
        colId,
        memKind as MembershipEntityKind,
        entries
      );
    }
  }

  /**
   * Handles granular cache invalidation on membership change events.
   */
  private handleMembershipChanged(payload: MembershipChangedPayload): void {
    // Invalidate affected collection
    this.cache.invalidateCollection(payload.collection.kind, payload.collection.id);

    // Invalidate affected members if provided
    if (payload.members) {
      for (const member of payload.members) {
        this.cache.invalidateMember(member.kind, member.id);
      }
    }
  }

  public notifyMembershipChanged(payload: MembershipChangedPayload): void {
    this.eventBus.emitMembershipChanged(payload);
  }
}
