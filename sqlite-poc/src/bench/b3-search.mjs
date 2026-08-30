// Phases 6+7 — Search benchmark & semantic comparison: pg_trgm (Nora's real semantics)
// vs SQLite (FTS5 trigram + LIKE fallback), on populated 50k data.
//
// Nora's real search (src/main/search/engines/SongSearchEngine.ts:26-38):
//   WHERE  title_ci ILIKE '%<escaped>%'                       -- index-assisted by pg_trgm GIN
//       OR regexp_replace(title_ci,'[[:punct:]]','','g') ILIKE '%<normalized>%'   -- full scan
//       OR title_ci % <normalized>                            -- trigram similarity >= 0.3
//   ORDER BY tiered-ILIKE CASE ... , similarity(title_ci, <normalized>) DESC
//
// SQLite candidate translations (all three measured):
//   A. plain LIKE:      lower(title) LIKE '%q%'            -- no punct-stripping, no fuzzy
//   B. FTS5 trigram:    fts_songs MATCH '"<q>"'            -- substring, >= 3 chars, ranked
//   C. LIKE fallback for queries < 3 chars (FTS5 trigram cannot match shorter)
//
// For each probe query we record: latency stats, row counts, and (for equivalence scoring)
// the id sets on each engine. Also non-ASCII probes (PG lower() is locale-aware; SQLite's is ASCII-only).
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { POC_ROOT, saveResults, envInfo, stats } from '../lib/util.mjs';
import path from 'node:path';
import { writeFileSync } from 'node:fs';

const SIZE = Number(process.argv[2] ?? 50000);
const REPS = Number(process.argv[3] ?? 10);
const sqliteDb = path.join(POC_ROOT, 'data', `sqlite-${SIZE}.db`);
const pgliteDir = path.join(POC_ROOT, 'data', `pglite-${SIZE}`);

const sq = await openSqlite(sqliteDb);
const pg = await openPglite(pgliteDir);

// Mirrors src/main/search/normalize/normalizeQuery.ts behavior: lower + strip punctuation.
const normalize = (q) => q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
const escapeLike = (q) => q.replace(/[%_\\]/g, '\\$&');

// Probe corpus — includes titles/variants that exist in the generated data
// (generator produces "MIDNIGHT CITY"-style, punctuation, "[Remastered 20xx]", "feat. X", Unicode).
const PROBES = [
  { label: 'exact_title', q: 'midnight city', kind: 'exact' },
  { label: 'prefix', q: 'gold', kind: 'prefix' },
  { label: 'substring', q: 'idnight ci', kind: 'substring' },
  { label: 'multi_word', q: 'shadow sky', kind: 'multi-word' },
  { label: 'case_mismatch', q: 'MIDNIGHT CITY', kind: 'case' },
  { label: 'punctuated', q: 'midnight-city!', kind: 'punct' },
  { label: 'partial_word', q: 'velv', kind: 'partial' },
  { label: 'short_query_2chars', q: 'fe', kind: 'short' },
  { label: 'single_char', q: 'a', kind: 'short' },
  { label: 'unicode', q: '夢のつづき', kind: 'unicode' },
  { label: 'unicode_partial', q: '願い', kind: 'unicode-partial' },
  { label: 'typo_transpose', q: 'midngith', kind: 'typo' },
  { label: 'typo_missing_char', q: 'velvt', kind: 'typo' },
  { label: 'artist_substring', q: 'tanaka', kind: 'artist' },
  { label: 'no_match', q: 'zzzznothing', kind: 'negative' }
];

// --- engine search implementations
async function pgSearchSongs(q, { limit = 50 } = {}) {
  const escaped = escapeLike(q);
  const normalized = normalize(q);
  const t0 = performance.now();
  const rows = await pg.all(
    `SELECT s.id, s.title FROM songs s
     WHERE (s.title_ci ILIKE $1
        OR regexp_replace(s.title_ci, '[[:punct:]]', '', 'g') ILIKE $2
        OR s.title_ci % $3)
     ORDER BY (CASE
        WHEN s.title_ci ILIKE $4 THEN 6
        WHEN s.title_ci ILIKE $5 THEN 5
        WHEN s.title_ci ILIKE $6 THEN 4
        WHEN s.title_ci ILIKE $1 THEN 3
        ELSE 1 END) DESC, similarity(s.title_ci, $3) DESC
     LIMIT $7`,
    [`%${escaped}%`, `%${normalized}%`, normalized, escaped, `${escaped}%`, `% ${escaped}%`, limit]
  );
  return { ms: performance.now() - t0, ids: rows.map((r) => r.id), rows };
}

function sqliteLikeSearch(q, { limit = 50 } = {}) {
  const t0 = performance.now();
  const rows = sq.all(
    `SELECT id, title FROM songs
     WHERE title LIKE '%' || ? || '%' ESCAPE '\\'
     ORDER BY (CASE
        WHEN title LIKE ? THEN 6
        WHEN title LIKE ? THEN 5
        WHEN title LIKE '%' || ? || '%' THEN 3
        ELSE 1 END) DESC
     LIMIT ?`,
    [q, q, `${q}%`, q, limit]
  );
  return { ms: performance.now() - t0, ids: rows.map((r) => r.id), rows };
}

function sqliteFtsSearch(q, { limit = 50 } = {}) {
  const normalized = normalize(q);
  if (normalized.length < 3) return null; // trigram tokenizer floor
  const t0 = performance.now();
  const rows = sq.all(
    `SELECT s.id, s.title FROM fts_songs f JOIN songs s ON s.id = f.rowid
     WHERE fts_songs MATCH ? ORDER BY rank LIMIT ?`,
    [`"${normalized}"`, limit]
  );
  return { ms: performance.now() - t0, ids: rows.map((r) => r.id), rows };
}

const results = { size: SIZE, probes: [] };
const detail = [];

for (const probe of PROBES) {
  const entry = { label: probe.label, query: probe.q, kind: probe.kind };
  // PG (Nora semantics)
  const pgTimes = [];
  let pgRes = null;
  for (let i = 0; i < REPS; i++) {
    pgRes = await pgSearchSongs(probe.q);
    pgTimes.push(pgRes.ms);
  }
  entry.pglite = { ...stats(pgTimes), n: pgRes.ids.length };

  // SQLite LIKE
  const likeTimes = [];
  let likeRes = null;
  for (let i = 0; i < REPS; i++) {
    likeRes = sqliteLikeSearch(probe.q);
    likeTimes.push(likeRes.ms);
  }
  entry.sqlite_like = { ...stats(likeTimes), n: likeRes.ids.length };

  // SQLite FTS5 trigram
  const ftsTimes = [];
  let ftsRes = null;
  for (let i = 0; i < REPS; i++) {
    const r = sqliteFtsSearch(probe.q);
    if (r) { ftsRes = r; ftsTimes.push(r.ms); }
  }
  entry.sqlite_fts5 = ftsRes ? { ...stats(ftsTimes), n: ftsRes.ids.length } : { skipped: 'query < 3 chars after normalize' };

  // set overlap (single latest run's ids)
  const pgIds = new Set(pgRes.ids);
  const likeIds = new Set(likeRes.ids);
  const jac = (a, b) => {
    if (!a.size && !b.size) return 1;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
  };
  entry.overlap = {
    pglite_vs_like: jac(pgIds, likeIds),
    pglite_vs_fts5: ftsRes ? jac(pgIds, new Set(ftsRes.ids)) : null
  };
  detail.push({
    probe: probe.label,
    pgliteIds: pgRes.ids.slice(0, 10),
    likeIds: likeRes.ids.slice(0, 10),
    ftsIds: ftsRes ? ftsRes.ids.slice(0, 10) : null
  });
  results.probes.push(entry);
  console.log(`${probe.label} (${probe.q}): pg=${entry.pglite.median}ms/${entry.pglite.n}r like=${entry.sqlite_like.median}ms/${entry.sqlite_like.n}r fts5=${ftsRes ? `${entry.sqlite_fts5.median}ms/${entry.sqlite_fts5.n}r` : 'skip'} | jac pg~like=${entry.overlap.pglite_vs_like.toFixed(2)} pg~fts=${entry.overlap.pglite_vs_fts5 ?? '-'}`);
}

// metadata cross-search (SongSearchEngine.ts:70-78) — artists/albums join with ILIKE
const metaProbe = async (q) => {
  const escaped = escapeLike(q);
  const normalized = normalize(q);
  const pgT = [];
  let pgMeta = null;
  for (let i = 0; i < REPS; i++) {
    const t0 = performance.now();
    pgMeta = await pg.all(
      `SELECT DISTINCT s.id FROM songs s
       LEFT JOIN artists_songs ars ON s.id = ars.song_id
       LEFT JOIN artists a ON ars.artist_id = a.id
       LEFT JOIN album_songs als ON s.id = als.song_id
       LEFT JOIN albums al ON als.album_id = al.id
       WHERE a.name_ci ILIKE $1 OR regexp_replace(a.name_ci,'[[:punct:]]','','g') ILIKE $2
          OR al.title_ci ILIKE $1 OR regexp_replace(al.title_ci,'[[:punct:]]','','g') ILIKE $2
       LIMIT 50`,
      [`%${escaped}%`, `%${normalized}%`]
    );
    pgT.push(performance.now() - t0);
  }
  const sqT = [];
  let sqMeta = null;
  for (let i = 0; i < REPS; i++) {
    const t0 = performance.now();
    sqMeta = sq.all(
      `SELECT DISTINCT s.id FROM songs s
       LEFT JOIN artists_songs ars ON s.id = ars.song_id
       LEFT JOIN artists a ON ars.artist_id = a.id
       LEFT JOIN album_songs als ON s.id = als.song_id
       LEFT JOIN albums al ON als.album_id = al.id
       WHERE a.name LIKE '%'||?||'%' OR al.title LIKE '%'||?||'%'
       LIMIT 50`,
      [q, q]
    );
    sqT.push(performance.now() - t0);
  }
  return { pglite: stats(pgT), sqlite: stats(sqT), pgN: pgMeta.length, sqN: sqMeta.length };
};
results.metadata_cross_search = await metaProbe('tanaka');
console.log('metadata cross-search (tanaka):', JSON.stringify(results.metadata_cross_search));

// write per-probe detail for search-comparison.md
writeFileSync(path.join(POC_ROOT, 'results', 'search-detail.json'), JSON.stringify({ probes: results.probes, detail }, null, 2));

await sq.close();
await pg.close();
await saveResults('search', { size: SIZE, reps: REPS, env: envInfo(), results });
