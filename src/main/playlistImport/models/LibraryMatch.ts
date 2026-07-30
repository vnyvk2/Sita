import type { LibrarySongRecord } from '../interfaces/LibraryLookup';

export type LibraryMatchStatus =
  | 'MATCHED'
  | 'NOT_IN_LIBRARY'
  | 'UNVERIFIED'
  | 'UNRESOLVED'
  | 'MISSING'
  | 'INVALID_URI';

export interface LibraryMatch {
  matchedSongId?: number;
  status: LibraryMatchStatus;
  confidence: number;
  candidates?: LibrarySongRecord[];
  diagnostics?: string[];
}
