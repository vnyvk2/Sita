import { MATCH_TIER, type MatchTierValue } from './MatchTier';
import { normalizeForSearch } from './normalizeForSearch';

/**
 * Computes the match tier between a raw text string and a search keyword.
 *
 * @param text The raw text to evaluate (e.g., song title, artist name).
 * @param normalizedKeyword The search keyword that has ALREADY been normalized.
 * @returns The computed match tier.
 */
export function computeTier(text: string, normalizedKeyword: string): MatchTierValue {
  const t = normalizeForSearch(text);

  if (t === normalizedKeyword) return MATCH_TIER.EXACT;
  if (t.startsWith(normalizedKeyword)) return MATCH_TIER.PREFIX;
  if (t.includes(' ' + normalizedKeyword)) return MATCH_TIER.WORD_PREFIX;
  if (t.includes(normalizedKeyword)) return MATCH_TIER.CONTAINS;

  return MATCH_TIER.FUZZY;
}
