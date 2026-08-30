import { sql } from 'drizzle-orm';

import type { DB, DBTransaction } from '../../db/db';
import { PG_SIMILARITY_THRESHOLD, pgSimilarity } from './pgTrgmSimilarity';

/**
 * Fuzzy `%`-replacement used by the search engines (b3b design):
 * 1. Candidate pool = rows sharing at least one trigram with the query, found via
 *    FTS5 trigram OR-queries (the same candidate model pg_trgm's GIN index uses,
 *    including word-boundary trigrams where expressible).
 * 2. Candidates scored in JS with pg_trgm's exact algorithm; >= 0.3 kept, best first.
 *
 * Returns { id, text } of similar rows (best first), excluding `excludeIds`, so
 * engines can compute match tiers from the display text exactly like the pg path did.
 */

export interface FuzzySearchArgs {
  /** table carrying the display text (e.g. 'songs') */
  baseTable: 'songs' | 'artists' | 'albums' | 'genres' | 'playlists';
  /** display text column on the base table (e.g. 'title') */
  textColumn: 'title' | 'name';
  /** the search query as typed (scoring input, mirroring pg's similarity(col, $query)) */
  query: string;
  limit: number;
  excludeIds?: Set<number>;
  trx?: DB | DBTransaction;
}

const escapePhrase = (s: string) => `"${s.replaceAll('"', '""')}"`;

/** word-boundary-aware trigram phrases that FTS can match in raw text */
export const trigramPhrases = (word: string): Set<string> => {
  const padded = `  ${word.toLowerCase()} `;
  const phrases = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) {
    const g = padded.slice(i, i + 3);
    const spaceCount = (g.match(/ /g) ?? []).length;
    if (spaceCount <= 1) phrases.add(g); // word-internal or single-boundary (' ve' / 'vt ')
    // two-space forms ('  v') cannot occur in stored text; skip
  }
  return phrases;
};

export const fuzzySearch = async (
  args: FuzzySearchArgs
): Promise<{ id: number; text: string }[]> => {
  const { baseTable, textColumn, query, limit, excludeIds, trx: trxArg } = args;
  const trx = trxArg ?? (await import('../../db/db')).db;
  const normKeep = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normKeep) return [];

  const phrases = new Set<string>();
  for (const w of normKeep.split(' ').filter(Boolean)) {
    for (const g of trigramPhrases(w)) phrases.add(g);
  }
  if (phrases.size === 0) return [];

  const orQuery = [...phrases].map(escapePhrase).join(' OR ');
  const ftsTable = `fts_${baseTable}`;
  const rows = (await trx.all(sql`
    SELECT s.id AS id, s.${sql.raw(textColumn)} AS text
    FROM ${sql.raw(ftsTable)} f
    JOIN ${sql.raw(baseTable)} s ON s.id = f.rowid
    WHERE ${sql.raw(ftsTable)} MATCH ${orQuery}
    ORDER BY rank
    LIMIT 8000
  `)) as { id: number; text: string }[];

  const exclude = excludeIds ?? new Set<number>();
  const scored: { id: number; sim: number }[] = [];
  for (const r of rows) {
    if (exclude.has(r.id)) continue;
    const sim = pgSimilarity(normKeep, String(r.text));
    if (sim >= PG_SIMILARITY_THRESHOLD) scored.push({ id: r.id, sim });
  }
  scored.sort((a, b) => b.sim - a.sim);
  return scored.slice(0, limit).map((s) => {
    const row = rows.find((r) => r.id === s.id);
    return { id: s.id, text: String(row?.text ?? '') };
  });
};
