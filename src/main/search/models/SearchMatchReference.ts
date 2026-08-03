import type { MatchTierValue } from '../../../common/search/MatchTier';

export type SearchEntityKind = 'song' | 'artist' | 'album' | 'playlist' | 'genre';

export interface MatchRange {
  start: number;
  end: number;
}

export interface SearchMatchReference {
  kind: SearchEntityKind;
  id: string | number;
  tier: MatchTierValue;
  score?: number;
  matchedField?: string;
  matchedRanges?: MatchRange[];
}
