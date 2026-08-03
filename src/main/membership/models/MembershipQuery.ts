import type { MembershipEntityKind, MembershipReference } from './MembershipReference';

export interface MembershipQueryOptions {
  readonly collection?: MembershipReference;
  readonly member?: MembershipReference;
  readonly targetKind?: MembershipEntityKind;
  readonly limit?: number;
  readonly offset?: number;
}
