import type { MembershipEntityKind } from './MembershipReference';

export interface MembershipEntry {
  readonly collectionKind: MembershipEntityKind;
  readonly collectionId: string | number;
  readonly memberKind: MembershipEntityKind;
  readonly memberId: string | number;
  readonly position?: number;
  readonly addedAt?: number;
}
