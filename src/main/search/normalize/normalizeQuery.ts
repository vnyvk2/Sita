import type { NormalizedQuery } from '../../../common/search/MatchTier';
import { normalizeForSearch } from '../../../common/search/normalizeForSearch';

/**
 * Normalize a search query for matching.
 *
 * @example
 *   normalizeQuery('A.R. Rahman')  → { original: 'A.R. Rahman', normalized: 'ar rahman', escaped: 'a.r. rahman' }
 *   normalizeQuery('AC/DC')        → { original: 'AC/DC',       normalized: 'acdc',       escaped: 'ac/dc' }
 *   normalizeQuery(' Night  Ch ')  → { original: 'Night  Ch',   normalized: 'night ch',   escaped: 'night ch' }
 *   normalizeQuery('50%')          → { original: '50%',         normalized: '50',         escaped: '50\\%' }
 */
export function normalizeQuery(input: string): NormalizedQuery {
  const original = input.trim();

  // Normalized version with punctuation and diacritics stripped
  const normalized = normalizeForSearch(original);

  // Escaped version for raw exact-matching with ILIKE (preserves punctuation)
  // We lowercase and collapse whitespace to match `citext` behaviour in SQL
  const cleanOriginal = original.toLowerCase().replace(/\s+/g, ' ').trim();
  // Escape SQL LIKE special characters (%, _, \)
  const escaped = cleanOriginal.replace(/[%_\\]/g, '\\$&');

  return { original, normalized, escaped };
}
