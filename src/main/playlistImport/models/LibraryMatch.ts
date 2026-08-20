import type { IdentityMatchType } from '../../metadata/identity/TrackIdentityMatcher';
import type { LibrarySongRecord } from '../interfaces/LibraryLookup';
import type { RepairDiagnostic } from './RepairDiagnostic';

export type LibraryMatchStatus =
  | 'MATCHED'
  | 'NOT_IN_LIBRARY'
  | 'UNVERIFIED'
  | 'UNRESOLVED'
  | 'MISSING'
  | 'INVALID_URI';

export type LibraryMatchType = 'EXACT' | 'REPAIRED' | IdentityMatchType;

export interface LibraryMatch {
  matchedSongId?: number;
  status: LibraryMatchStatus;
  matchType?: LibraryMatchType;
  confidence: number;
  candidates?: LibrarySongRecord[];
  diagnostics?: (string | RepairDiagnostic)[];
}
