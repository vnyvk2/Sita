/**
 * Canonical Normalization Contract for Metadata Matching & Search.
 *
 * Pipeline:
 *
 * 1. NFC normalization (.normalize('NFC'))
 * 2. Lowercase (.toLowerCase())
 * 3. NFD decomposition, Latin diacritics stripping ([\u0300-\u036f]), NFC recomposition
 * 4. Replace punctuation and symbols with space (/[^\p{L}\p{N}]/gu, ' ')
 * 5. Collapse whitespace and trim (/\s+/g, ' ').trim()
 *
 * Guarantees:
 *
 * - "Rock & Roll" -> "rock roll"
 * - "AC/DC" -> "ac dc"
 * - "夜に駆ける" -> "夜に駆ける"
 * - "Кино" -> "кино"
 * - "Café" -> "cafe"
 * - "🎵🔥" -> ""
 *
 * Invariant: Empty normalized values ("") must score 0 points at matching layers.
 */
export function normalizeForMatching(input?: string): string {
  if (!input) return '';

  return input
    .normalize('NFC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
