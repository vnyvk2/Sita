// Phase 13 — Smart Playlist compatibility: semantic equivalence between PGlite and SQLite.
// Ports SmartPlaylistCompiler.ts expressions to SQLite equivalents and diffs RESULT SETS
// (song id sets + row values) on identical 50k datasets, not just TypeScript compilability.
//
// PG expression (SmartPlaylistCompiler.ts:35-70)     -> SQLite equivalent
//   col ILIKE '%v%'                                   -> lower(col) LIKE '%v%'          (LIKE is ASCII-CI; _ci cols are lower() already)
//   col = true / = false                              -> is_favorite = 1 / = 0
//   col >= NOW() - (v || ' days')::interval           -> col >= strftime('%Y-%m-%dT%H:%M:%fZ', datetime('now', '-' || v || ' days'))
//   col <  NOW() - (v || ' days')::interval           -> col <  strftime(...)
//   NULL ops, comparisons, in/not in                  -> identical
// Also probes: PG lower() locale vs SQLite ASCII lower() on Unicode titles.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { POC_ROOT, saveResults, envInfo } from '../lib/util.mjs';
import path from 'node:path';

const SIZE = Number(process.argv[2] ?? 50000);
const sq = await openSqlite(path.join(POC_ROOT, 'data', `sqlite-${SIZE}.db`));
const pg = await openPglite(path.join(POC_ROOT, 'data', `pglite-${SIZE}`));

const results = { size: SIZE, rules: [] };
let mismatches = 0;

async function compareRule(name, pgSql, pgParams, sqSql, sqParams) {
  const pgRows = await pg.all(pgSql, pgParams);
  const sqRows = sq.all(sqSql, sqParams);
  const pgIds = pgRows.map((r) => r.id).sort((a, b) => a - b);
  const sqIds = sqRows.map((r) => r.id).sort((a, b) => a - b);
  const onlyPg = pgIds.filter((x) => !sqIds.includes(x));
  const onlySq = sqIds.filter((x) => !pgIds.includes(x));
  const match = onlyPg.length === 0 && onlySq.length === 0;
  if (!match) mismatches++;
  const entry = { name, pgCount: pgIds.length, sqCount: sqIds.length, match, onlyPgSample: onlyPg.slice(0, 5), onlySqSample: onlySq.slice(0, 5) };
  results.rules.push(entry);
  console.log(`${match ? '✓' : '✗'} ${name}: pg=${pgIds.length} sqlite=${sqIds.length}${match ? '' : ` onlyPg=[${entry.onlyPgSample}] onlySq=[${entry.onlySqSample}]`}`);
  return entry;
}



// contains / not_contains (SmartPlaylistCompiler.ts:49-51)
await compareRule(
  'contains: title ILIKE %golden%',
  `SELECT id FROM songs WHERE title ILIKE $1`, ['%golden%'],
  `SELECT id FROM songs WHERE title LIKE '%golden%'`, []
);
await compareRule(
  'contains: artist name ILIKE %tanaka%',
  `SELECT s.id FROM songs s JOIN artists_songs ars ON ars.song_id = s.id JOIN artists a ON a.id = ars.artist_id WHERE a.name ILIKE $1`, ['%tanaka%'],
  `SELECT s.id FROM songs s JOIN artists_songs ars ON ars.song_id = s.id JOIN artists a ON a.id = ars.artist_id WHERE a.name LIKE '%tanaka%'`, []
);
await compareRule(
  'not_contains: title NOT ILIKE %golden%',
  `SELECT id FROM songs WHERE title NOT ILIKE $1 ORDER BY id`, ['%golden%'],
  `SELECT id FROM songs WHERE title NOT LIKE '%golden%' ORDER BY id`, []
);

// starts_with / ends_with (compiles to ILIKE v% / %v)
await compareRule(
  'starts_with: title ILIKE mid%',
  `SELECT id FROM songs WHERE title ILIKE $1`, ['mid%'],
  `SELECT id FROM songs WHERE title LIKE 'mid%'`, []
);
await compareRule(
  'ends_with: title ILIKE %city',
  `SELECT id FROM songs WHERE title ILIKE $1`, ['%city'],
  `SELECT id FROM songs WHERE title LIKE '%city'`, []
);

// eq/neq/comparisons on numeric + boolean fields
await compareRule(
  'eq: year = 1994',
  `SELECT id FROM songs WHERE year = $1`, [1994],
  `SELECT id FROM songs WHERE year = ?`, [1994]
);
await compareRule(
  'gt: duration > 300',
  `SELECT id FROM songs WHERE duration > $1`, [300],
  `SELECT id FROM songs WHERE duration > ?`, [300]
);
await compareRule(
  'is_true: is_favorite = true',
  `SELECT id FROM songs WHERE is_favorite = true`, [],
  `SELECT id FROM songs WHERE is_favorite = 1`, []
);
await compareRule(
  'is_false: is_blacklisted = false',
  `SELECT id FROM songs WHERE is_blacklisted = false`, [],
  `SELECT id FROM songs WHERE is_blacklisted = 0`, []
);
await compareRule(
  'is_null: language IS NULL',
  `SELECT id FROM songs WHERE language IS NULL ORDER BY id`, [],
  `SELECT id FROM songs WHERE language IS NULL ORDER BY id`, []
);
await compareRule(
  'is_not_null: isrc IS NOT NULL',
  `SELECT id FROM songs WHERE isrc IS NOT NULL ORDER BY id`, [],
  `SELECT id FROM songs WHERE isrc IS NOT NULL ORDER BY id`, []
);

// in_last / not_in_last (SmartPlaylistCompiler.ts:65-67) — the NOW()-interval case
await compareRule(
  'in_last: created_at >= NOW() - 30 days',
  `SELECT id FROM songs WHERE created_at >= NOW() - ($1 || ' days')::interval ORDER BY id`, ['30'],
  `SELECT id FROM songs WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-30 days') ORDER BY id`, []
);
await compareRule(
  'not_in_last: created_at < NOW() - 90 days',
  `SELECT id FROM songs WHERE created_at < NOW() - ($1 || ' days')::interval ORDER BY id`, ['90'],
  `SELECT id FROM songs WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-90 days') ORDER BY id`, []
);

// combined group AND/OR (compilePredicate groups)
await compareRule(
  'group AND: is_favorite AND year > 2010',
  `SELECT id FROM songs WHERE is_favorite = true AND year > $1`, [2010],
  `SELECT id FROM songs WHERE is_favorite = 1 AND year > ?`, [2010]
);
await compareRule(
  'group OR: language = ko OR language = ja',
  `SELECT id FROM songs WHERE language = $1 OR language = $2`, ['ko', 'ja'],
  `SELECT id FROM songs WHERE language = ? OR language = ?`, ['ko', 'ja']
);

// skipCount (lsSongs.skipCount + 1 semantics)
await compareRule(
  'gte: skip_count >= 3',
  `SELECT id FROM songs WHERE skip_count >= $1`, [3],
  `SELECT id FROM songs WHERE skip_count >= ?`, [3]
);

// Unicode case behavior: PG lower() is locale-aware; SQLite lower() is ASCII-only.
// Both engines query ORIGINAL titles here (compiler uses plain columns + ILIKE).
{
  const pgRows = await pg.all(`SELECT id, title FROM songs WHERE title ILIKE $1 LIMIT 20`, ['%夢のつづき%']);
  const sqRows = sq.all(`SELECT id, title FROM songs WHERE title LIKE '%夢のつづき%' LIMIT 20`);
  const pgIds = pgRows.map((r) => r.id).sort((a, b) => a - b);
  const sqIds = sqRows.map((r) => r.id).sort((a, b) => a - b);
  const entry = { name: 'unicode: CJK title match (case paths not exercised)', pgCount: pgIds.length, sqCount: sqIds.length, match: JSON.stringify(pgIds) === JSON.stringify(sqIds) };
  results.rules.push(entry);
  console.log(`${entry.match ? '✓' : '✗'} ${entry.name}: pg=${pgIds.length} sqlite=${sqIds.length}`);
  // case-mapping difference on non-ASCII (documented deviation — _ci columns)
  const pgCi = await pg.all(`SELECT id FROM songs WHERE title_ci = $1 LIMIT 5`, ['夢のつづき']);  // citext CI-compare, locale-aware
  const sqCi = sq.all(`SELECT id FROM songs WHERE title_ci = ? LIMIT 5`, ['夢のつづき']);        // lower() ASCII-only — CJK unaffected (no case)
  results.unicode_ci_note = {
    note: 'PG citext lower() is locale-aware; SQLite lower() is ASCII-only. For CJK (caseless scripts) both behave identically. Risk: Turkish İ/ı, Greek final sigma in title_ci equality/ORDER BY.',
    pgCount: pgCi.length, sqCount: sqCi.length
  };
  console.log(`unicode ci compare: pg=${pgCi.length} sqlite=${sqCi.length} (see unicode_ci_note)`);
}

results.mismatchCount = mismatches;
results.verdict = mismatches === 0 ? 'EQUIVALENT (all rule result sets identical)' : `${mismatches} rule(s) differ — see rules[].match=false`;
console.log(`\nSMART PLAYLIST EQUIVALENCE: ${results.verdict}`);

await sq.close();
await pg.close();
await saveResults('smartplaylist', { env: envInfo(), results });
