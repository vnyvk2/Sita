import { sql } from 'drizzle-orm';

import type { DB, DBTransaction } from '../../db/db';
import { rawAll } from '../../db/sqlite/raw';
import { PG_SIMILARITY_THRESHOLD, PG_SIMILARITY_FLOOR, pgSimilarity } from './pgTrgmSimilarity';

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
  /** Kept for API compatibility: rawAll targets the same connection, so queries
   *  issued here always participate in the caller's transaction. */
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
  const { baseTable, textColumn, query, limit, excludeIds } = args;
  void args.trx;
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
  // rawAll (object rows) — drizzle's proxy .all() returns positional arrays for raw
  // SQL. Targets the same connection, so it joins the caller's transaction.
  const rows = await rawAll<{ id: number; text: string }>(sql`
    SELECT s.id AS id, s.${sql.raw(textColumn)} AS text
    FROM ${sql.raw(ftsTable)} f
    JOIN ${sql.raw(baseTable)} s ON s.id = f.rowid
    WHERE ${sql.raw(ftsTable)} MATCH ${orQuery}
    ORDER BY rank
    LIMIT 8000
  `, args.trx);

  const exclude = excludeIds ?? new Set<number>();
  // Score every candidate once, then apply a PROGRESSIVE threshold:
  //   pass 1 — pg_trgm's exact 0.3 (parity with the PG build's `%` operator)
  //   pass 2 — 0.2 relaxation, used ONLY when pass 1 found nothing. Catches
  //            transpositions ('midngith' = 0.286) and short-ish typos
  //            ('goln' = 0.214) that pg_trgm rejected — a deliberate
  //            improvement over the PGlite build, at bounded noise cost
  //            (pass 2 never runs when pass 1 already matched).
  const scored: { id: number; sim: number; text: string }[] = [];
  for (const r of rows) {
    if (exclude.has(r.id)) continue;
    const sim = pgSimilarity(normKeep, String(r.text));
    if (sim >= PG_SIMILARITY_FLOOR) scored.push({ id: r.id, sim, text: String(r.text) });
  }
  scored.sort((a, b) => b.sim - a.sim);

  const bestSim = scored[0]?.sim ?? 0;
  const threshold = bestSim >= PG_SIMILARITY_THRESHOLD ? PG_SIMILARITY_THRESHOLD : PG_SIMILARITY_FLOOR;

  const out: { id: number; text: string }[] = [];
  for (const s of scored) {
    if (out.length >= limit) break;
    if (s.sim < threshold) break; // sorted desc — everything after is below
    out.push({ id: s.id, text: s.text });
  }
  return out;
};
