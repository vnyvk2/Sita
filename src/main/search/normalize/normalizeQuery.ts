import type { NormalizedQuery } from '../../../common/search/MatchTier';

/**
 * Normalize a search query for matching.
 *
 * @example
 * normalizeQuery('A.R. Rahman')  → { original: 'A.R. Rahman', normalized: 'ar rahman', escaped: 'ar rahman' }
 * normalizeQuery('AC/DC')        → { original: 'AC/DC',       normalized: 'acdc',       escaped: 'acdc' }
 * normalizeQuery(' Night  Ch ')  → { original: 'Night  Ch',   normalized: 'night ch',   escaped: 'night ch' }
 * normalizeQuery('50%')          → { original: '50%',         normalized: '50',          escaped: '50' }
 */
export function normalizeQuery(input: string): NormalizedQuery {
  const original = input.trim();

  const normalized = original
    .toLowerCase()
    .replace(/[.\-/\\'"!?@#$%^&*()_+=,;:<>{}[\]|`~]/g, '') // strip punctuation
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();

  // Escape SQL LIKE special characters so user input is never treated as wildcards
  const escaped = normalized.replace(/[%_\\]/g, '\\$&');

  return { original, normalized, escaped };
}
