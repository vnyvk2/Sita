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
   * Atomically sets members for a collection and updates reverse index entries cleanly. Removes
   * previous reverse map entries for this collection before setting new entries.
   */
  public setMembers(
    collectionKind: MembershipEntityKind,
    collectionId: string | number,
    memberKind: MembershipEntityKind,
    entries: MembershipEntry[]
  ): void {
    const forwardKey = this.buildForwardKey(collectionKind, collectionId, memberKind);
    const prevEntries = this.forwardMap.get(forwardKey) ?? [];

    // Remove previous collection references from reverseMap
    for (const prev of prevEntries) {
      const revKey = this.buildReverseKey(prev.memberKind, prev.memberId, collectionKind);
      const existingRev = this.reverseMap.get(revKey);
      if (existingRev) {
        const filtered = existingRev.filter((r) => String(r.id) !== String(collectionId));
        if (filtered.length > 0) {
          this.reverseMap.set(revKey, filtered);
        } else {
          this.reverseMap.delete(revKey);
        }
      }
    }

    // Set new forward entry
    this.forwardMap.set(forwardKey, [...entries]);

    // Set new reverse entries
    const collectionRef: MembershipReference = { kind: collectionKind, id: collectionId };
    for (const entry of entries) {
      const revKey = this.buildReverseKey(entry.memberKind, entry.memberId, collectionKind);
      const existingRev = this.reverseMap.get(revKey) ?? [];
      if (!existingRev.some((r) => String(r.id) === String(collectionId))) {
        this.reverseMap.set(revKey, [...existingRev, collectionRef]);
      }
    }
  }

  /** Atomically sets collections containing a member and updates reverse index. */
  public setCollectionsContaining(
    memberKind: MembershipEntityKind,
    memberId: string | number,
    collectionKind: MembershipEntityKind,
    collections: MembershipReference[]
  ): void {
    const reverseKey = this.buildReverseKey(memberKind, memberId, collectionKind);
    this.reverseMap.set(reverseKey, [...collections]);
  }

  /** Granular invalidation for a specific collection across BOTH forward and reverse maps. */
  public invalidateCollection(
    collectionKind: MembershipEntityKind,
    collectionId: string | number
  ): void {
    const prefix = `${collectionKind}:${collectionId}:`;
    for (const [forwardKey, entries] of this.forwardMap.entries()) {
      if (forwardKey.startsWith(prefix)) {
        // Clean corresponding reverse entries pointing to this collection
        for (const entry of entries) {
          const revKey = this.buildReverseKey(entry.memberKind, entry.memberId, collectionKind);
          const existingRev = this.reverseMap.get(revKey);
          if (existingRev) {
            const filtered = existingRev.filter((r) => String(r.id) !== String(collectionId));
            if (filtered.length > 0) {
              this.reverseMap.set(revKey, filtered);
            } else {
              this.reverseMap.delete(revKey);
            }
          }
        }
        this.forwardMap.delete(forwardKey);
      }
    }
  }

  /** Granular invalidation for a specific member across BOTH reverse and forward maps. */
  public invalidateMember(memberKind: MembershipEntityKind, memberId: string | number): void {
    const prefix = `${memberKind}:${memberId}:`;
    for (const key of this.reverseMap.keys()) {
      if (key.startsWith(prefix)) {
        this.reverseMap.delete(key);
      }
    }

    // Filter member from all cached forward entries
    for (const [forwardKey, entries] of this.forwardMap.entries()) {
      const filtered = entries.filter(
        (e) => !(e.memberKind === memberKind && String(e.memberId) === String(memberId))
      );
      if (filtered.length !== entries.length) {
        this.forwardMap.set(forwardKey, filtered);
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
