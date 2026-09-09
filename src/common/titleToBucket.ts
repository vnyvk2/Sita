/**
 * Maps a song title to its corresponding alphabet navigation bucket.
 *
 * Rules:
 * - Null, undefined, or whitespace-only titles map to '#'
 * - ASCII letters A-Z (case-insensitive) map to uppercase 'A'-'Z'
 * - Digits, punctuation, symbols, and non-Latin characters map to '#'
 *
 * This function serves as the single source of truth for alphabet scrubber
 * bucketing across both the main SQLite query stream and tests.
 */
export function titleToBucket(title: string | null | undefined): string {
  if (!title) return '#';
  const trimmed = title.trim();
  if (!trimmed) return '#';
  const ch = trimmed.charAt(0);
  return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') ? ch.toUpperCase() : '#';
}
