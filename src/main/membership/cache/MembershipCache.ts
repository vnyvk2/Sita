import type { MembershipEntry } from '../models/MembershipEntry';
import type { MembershipEntityKind, MembershipReference } from '../models/MembershipReference';

export class MembershipCache {
  // Forward map: "collectionKind:collectionId:memberKind" -> MembershipEntry[]
  private readonly forwardMap = new Map<string, MembershipEntry[]>();

  // Reverse map: "memberKind:memberId:collectionKind" -> MembershipReference[]
  private readonly reverseMap = new Map<string, MembershipReference[]>();

  private buildForwardKey(
    collectionKind: MembershipEntityKind,
    collectionId: string | number,
    memberKind: MembershipEntityKind
  ): string {
    return `${collectionKind}:${collectionId}:${memberKind}`;
  }

  private buildReverseKey(
    memberKind: MembershipEntityKind,
    memberId: string | number,
    collectionKind: MembershipEntityKind
  ): string {
    return `${memberKind}:${memberId}:${collectionKind}`;
  }

  public getMembers(
    collectionKind: MembershipEntityKind,
    collectionId: string | number,
    memberKind: MembershipEntityKind
  ): MembershipEntry[] | undefined {
    const key = this.buildForwardKey(collectionKind, collectionId, memberKind);
    return this.forwardMap.get(key);
  }

  public getCollectionsContaining(
    memberKind: MembershipEntityKind,
    memberId: string | number,
    collectionKind: MembershipEntityKind
  ): MembershipReference[] | undefined {
    const key = this.buildReverseKey(memberKind, memberId, collectionKind);
    return this.reverseMap.get(key);
  }

  public hasMembers(
    collectionKind: MembershipEntityKind,
    collectionId: string | number,
    memberKind: MembershipEntityKind
  ): boolean {
    const key = this.buildForwardKey(collectionKind, collectionId, memberKind);
    return this.forwardMap.has(key);
  }

  public hasCollectionsContaining(
    memberKind: MembershipEntityKind,
    memberId: string | number,
    collectionKind: MembershipEntityKind
  ): boolean {
    const key = this.buildReverseKey(memberKind, memberId, collectionKind);
    return this.reverseMap.has(key);
  }

  /**
   * Atomically sets members for a collection and updates reverse index entries.
   */
  public setMembers(
    collectionKind: MembershipEntityKind,
    collectionId: string | number,
    memberKind: MembershipEntityKind,
    entries: MembershipEntry[]
  ): void {
    const forwardKey = this.buildForwardKey(collectionKind, collectionId, memberKind);
    this.forwardMap.set(forwardKey, [...entries]);

    const collectionRef: MembershipReference = { kind: collectionKind, id: collectionId };

    // Update reverse map entries for each member
    for (const entry of entries) {
      const reverseKey = this.buildReverseKey(entry.memberKind, entry.memberId, collectionKind);
      const existing = this.reverseMap.get(reverseKey) ?? [];
      if (!existing.some((r) => String(r.id) === String(collectionId))) {
        this.reverseMap.set(reverseKey, [...existing, collectionRef]);
      }
    }
  }

  /**
   * Atomically sets collections containing a member and updates forward index entries.
   */
  public setCollectionsContaining(
    memberKind: MembershipEntityKind,
    memberId: string | number,
    collectionKind: MembershipEntityKind,
    collections: MembershipReference[]
  ): void {
    const reverseKey = this.buildReverseKey(memberKind, memberId, collectionKind);
    this.reverseMap.set(reverseKey, [...collections]);
  }

  /**
   * Granular invalidation for a specific collection.
   */
  public invalidateCollection(
    collectionKind: MembershipEntityKind,
    collectionId: string | number
  ): void {
    const prefix = `${collectionKind}:${collectionId}:`;
    for (const key of this.forwardMap.keys()) {
      if (key.startsWith(prefix)) {
        this.forwardMap.delete(key);
      }
    }
  }

  /**
   * Granular invalidation for a specific member.
   */
  public invalidateMember(
    memberKind: MembershipEntityKind,
    memberId: string | number
  ): void {
    const prefix = `${memberKind}:${memberId}:`;
    for (const key of this.reverseMap.keys()) {
      if (key.startsWith(prefix)) {
        this.reverseMap.delete(key);
      }
    }
  }

  public clear(): void {
    this.forwardMap.clear();
    this.reverseMap.clear();
  }

  public size(): { forward: number; reverse: number } {
    return {
      forward: this.forwardMap.size,
      reverse: this.reverseMap.size
    };
  }
}
