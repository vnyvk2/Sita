import type { MembershipEntry } from './MembershipEntry';
import type { MembershipReference } from './MembershipReference';

export interface MembershipResult {
  readonly members: readonly MembershipReference[];
  readonly collections: readonly MembershipReference[];
  readonly entries: readonly MembershipEntry[];
  readonly totalCount: number;
}
