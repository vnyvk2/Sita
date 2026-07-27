/**
 * Normalizes a string for search comparisons.
 *
 * This function acts as the single source of truth for string normalization
 * across the entire search architecture (SQL matching, tier computation, highlighting).
 *
 * Normalization rules:
 * 1. Convert to lowercase.
 * 2. Unicode normalization (NFD) to decompose combined graphemes.
 * 3. Remove diacritics (accents) using Unicode property escapes.
 * 4. Remove all punctuation and symbols.
 * 5. Collapse all whitespace into a single space.
 * 6. Trim leading/trailing whitespace.
 *
 * @example
 * normalizeForSearch('AC/DC')        → 'acdc'
 * normalizeForSearch('A.R. Rahman')  → 'ar rahman'
 * normalizeForSearch('Björk')        → 'bjork'
 * normalizeForSearch('Pokémon')      → 'pokemon'
 * normalizeForSearch('a  r  rahman') → 'a r rahman'
 */
export function normalizeForSearch(input: string): string {
  if (!input) return '';

  return input
    // 1. Lowercase
    .toLowerCase()
    // 2. Unicode normalization (decompose combined graphemes into base + accent)
    .normalize('NFD')
    // 3. Remove diacritics (Combining Diacritical Marks)
    .replace(/[\u0300-\u036f]/g, '')
    // 4. Remove all punctuation and symbols (everything except letters, numbers, and whitespace)
    // Note: We also remove underscores which are normally part of \w.
    .replace(/[.\-/\\'"!?@#$%^&*()_+=,;:<>{}[\]|`~]/g, '')
    // 5. Collapse whitespace
    .replace(/\s+/g, ' ')
    // 6. Trim
    .trim();
}
