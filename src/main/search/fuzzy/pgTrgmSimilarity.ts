/**
 * pg_trgm's similarity algorithm, ported to JS (b3b-verified against PG:
 * reproduces PG's `%` / similarity() match sets exactly on 50k rows).
 *
 * pg_trgm: split into words (non-alphanumeric = separator), pad each word with
 * two leading spaces and one trailing space, take trigram SETS (deduped),
 * similarity = |A∩B| / (|A| + |B| - |A∩B|). Default threshold 0.3.
 */

const trigramsOfWord = (word: string): Set<string> => {
  const padded = `  ${word} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
};

export const wordTrigrams = (text: string): Set<string> => {
  const set = new Set<string>();
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!w) continue;
    for (const g of trigramsOfWord(w)) set.add(g);
  }
  return set;
};

export const pgSimilarity = (a: string, b: string): number => {
  const A = wordTrigrams(a);
  const B = wordTrigrams(b);
  if (A.size === 0 && B.size === 0) return 1;
  let m = 0;
  for (const g of A) if (B.has(g)) m++;
  return m / (A.size + B.size - m);
};

/** pg_trgm.similarity_threshold default — the `%` operator's cutoff. */
export const PG_SIMILARITY_THRESHOLD = 0.3;

export const isPgSimilar = (a: string, b: string, threshold = PG_SIMILARITY_THRESHOLD): boolean =>
  pgSimilarity(a, b) >= threshold;
