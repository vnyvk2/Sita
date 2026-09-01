import type { MembershipEntry } from '../models/MembershipEntry';
import type { MembershipEntityKind, MembershipReference } from '../models/MembershipReference';

export interface IMembershipRepository {
  getMembers(
    collection: MembershipReference,
    memberKind: MembershipEntityKind
  ): Promise<MembershipEntry[]>;

  getCollectionsContaining(
    member: MembershipReference,
    collectionKind: MembershipEntityKind
  ): Promise<MembershipEntry[]>;

  getCollectionsContainingMany(
    members: MembershipReference[],
    collectionKind: MembershipEntityKind
  ): Promise<MembershipEntry[]>;

  contains(collection: MembershipReference, member: MembershipReference): Promise<boolean>;

  containsMany(
    collection: MembershipReference,
    members: MembershipReference[]
  ): Promise<Map<string | number, boolean>>;

  countMembers(collection: MembershipReference, memberKind: MembershipEntityKind): Promise<number>;

  getAllCollectionMemberships(memberKind: MembershipEntityKind): Promise<MembershipEntry[]>;
}
