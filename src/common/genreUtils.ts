/**
 * Canonical delimiter regex for splitting multi-genre metadata strings.
 *
 * Rules:
 *
 * - Commas (,) and Semicolons (;) are unconditional delimiters
 * - Newlines (\n, \r) and Null bytes (\0) are delimiters
 * - Slashes surrounded by whitespace ( e.g. " / ", " \ ", " | " ) are delimiters
 * - Double or more consecutive slashes ( e.g. "//" ) are delimiters
 * - Standalone single slashes ( e.g. "Hip-Hop/Rap", "R&B/Soul", "AC/DC" ) are PRESERVED
 * - Ampersands (&) ( e.g. "Rock & Roll", "R&B" ) are PRESERVED
 */
// eslint-disable-next-line no-control-regex
export const GENRE_SEPARATOR_REGEX = /[,;\u0000\n\r]+|\s+[/\\|]\s+|\/{2,}/;

/**
 * Tokenizes, trims, deduplicates (case-insensitively, preserving first encountered
 * spelling/casing), and normalizes genre inputs.
 *
 * Handles: - string input: "Rock,pop" -> ["Rock", "pop"] - string array: ["Rock, Pop", "Indie"] ->
 * ["Rock", "Pop", "Indie"] - mixed/empty/null/undefined inputs -> [] - deduplication: ["Rock",
 * "rock", "ROCK; Pop"] -> ["Rock", "Pop"]
 */
export function parseGenreList(genres?: string[] | string | null): string[] {
  if (!genres) return [];

  const rawList = Array.isArray(genres) ? genres : [genres];
  const result: string[] = [];
  const seen = new Set<string>();

  for (const item of rawList) {
    if (typeof item !== 'string' || !item.trim()) continue;

    const tokens = item
      .split(GENRE_SEPARATOR_REGEX)
      .map((t) => t.trim())
      .filter((t) => t.length > 0);

    for (const token of tokens) {
      const lower = token.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(token);
      }
    }
  }

  return result;
}
