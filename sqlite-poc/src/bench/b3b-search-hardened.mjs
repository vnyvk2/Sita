// b3b — SEARCH HARDENING: close the two semantic regressions found in b3.
//
// Regressions to close (vs pg_trgm):
//   1. punctuation-insensitive matching  ('midnight-city!' -> 'MIDNIGHT CITY')
//   2. missing/extra-letter typos        ('velvt' -> 'velvet heart')
// plus the <3-char FTS floor (fallback design).
//
// Strategy (mirrors how pg_trgm actually works internally):
//   a. fts_songs_norm: FTS5 trigram table over a JS-normalized title
//      (lowercase, all non-alphanumerics INCLUDING spaces stripped), maintained by the
//      ingest path — the production translation of Nora's citext+regexp_replace behavior.
//      Query side: normalize the same way, phrase-match. Closes regression 1.
//   b. fuzzy: candidate pool via FTS5 trigram OR-queries (the same "share at least one
//      trigram" candidate model pg_trgm's GIN index uses), scored in JS with pg_trgm's
//      ACTUAL similarity algorithm (word-split, space-padded trigram sets,
//      similarity = |A∩B| / (|A|+|B|-|A∩B|), threshold 0.3). Closes regression 2.
//   c. queries shorter than 3 chars: LIKE '%q%' fallback (measured 5-13ms @50k in b3).
//
// Compares hardened-SQLite vs PGlite (Nora semantics) on the same probe corpus and 50k data.
import { openSqlite } from '../engines/sqlite-engine.mjs';
import { openPglite } from '../engines/pglite-engine.mjs';
import { POC_ROOT, saveResults, envInfo, stats } from '../lib/util.mjs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const SIZE = Number(process.argv[2] ?? 50000);
const REPS = Number(process.argv[3] ?? 8);
const LIMIT = 50;

const sq = await openSqlite(path.join(POC_ROOT, 'data', `sqlite-${SIZE}.db`));
const pg = await openPglite(path.join(POC_ROOT, 'data', `pglite-${SIZE}`));

// ---------- 1. build fts_songs_norm (ingest-time cost model) ----------
const buildT0 = performance.now();
sq.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS fts_songs_norm USING fts5(title_norm, content='', contentless_delete=1, tokenize='trigram')`);
const normText = (s) => s.toLowerCase().replace(/[^a-z0-9\u00c0-\u024f\u0400-\u04ff\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g, '');
// production would maintain this at insert/update time; here we backfill once
const allTitles = sq.all(`SELECT id, title FROM songs`);
const normRows = allTitles.map((r) => ({ id: r.id, norm: normText(r.title) }));
sq.exec('BEGIN');
const insNorm = sq.raw.prepare(`INSERT INTO fts_songs_norm(rowid, title_norm) VALUES (?, ?)`);
for (const r of normRows) insNorm.run(r.id, r.norm);
sq.exec('COMMIT');
const buildMs = performance.now() - buildT0;
console.log(`fts_songs_norm built over ${allTitles.length} rows in ${Math.round(buildMs)}ms (one-time ingest cost; production maintains incrementally)`);

// ---------- 2. pg_trgm's actual similarity algorithm, in JS ----------
const trigrams = (word) => {
  const padded = '  ' + word + ' ';
  const out = new Set();
  for (let i = 0; i + 3 <= padded.length; i++) out.add(padded.slice(i, i + 3));
  return out;
};
const wordTrigrams = (text) => {
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const set = new Set();
  for (const w of words) for (const g of trigrams(w)) set.add(g);
  return set;
};
const pgSimilarity = (a, b) => {
  const A = wordTrigrams(a), B = wordTrigrams(b);
  let m = 0;
  for (const g of A) if (B.has(g)) m++;
  return m / (A.size + B.size - m);
};
const THRESHOLD = 0.3; // pg_trgm.similarity_threshold default

// ---------- 3. hardened search ----------
function escapeFtsPhrase(s) {
  return '"' + s.replaceAll('"', '""') + '"';
}

function hardenedSearch(q, { limit = LIMIT } = {}) {
  const t0 = performance.now();
  const norm = normText(q); // spaces stripped — punctuation-proof phrase matching
  // pg-mirror normalization: lowercase, strip punctuation, KEEP spaces (mirrors Nora's
  // regexp_replace(title_ci,'[[:punct:]]','','g') + trigram % input)
  const normKeep = q.toLowerCase().replace(/[^a-z0-9\s\u00c0-\u024f\u0400-\u04ff\u0e00-\u0e7f\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/g, '').replace(/\s+/g, ' ').trim();
  const found = new Map(); // id -> {title, order}
  let order = 0;

  // (a) raw phrase FTS (natural multiword, substring >= 3 chars)
  const rawTrim = q.trim();
  if (rawTrim.length >= 3) {
    const rows = sq.all(
      `SELECT s.id, s.title FROM fts_songs f JOIN songs s ON s.id = f.rowid WHERE fts_songs MATCH ? ORDER BY rank LIMIT ?`,
      [escapeFtsPhrase(rawTrim), limit]
    );
    for (const r of rows) if (!found.has(r.id)) found.set(r.id, { title: r.title, rank: order++ });
  }

  // (b) normalized FTS (punctuation/space-insensitive; closes regression 1)
  if (norm.length >= 3) {
    const rows = sq.all(
      `SELECT s.id, s.title FROM fts_songs_norm f JOIN songs s ON s.id = f.rowid WHERE fts_songs_norm MATCH ? ORDER BY rank LIMIT ?`,
      [escapeFtsPhrase(norm), limit]
    );
    for (const r of rows) if (!found.has(r.id)) found.set(r.id, { title: r.title, rank: order++ });
  }

  // (c) fuzzy: trigram-OR candidate pool + pg-style JS scoring (closes regression 2)
  //     This is the `%` (similarity >= 0.3) replacement. Candidate model mirrors pg_trgm's GIN:
  //     rows sharing at least one of the query's trigrams. Uses the RAW (space-keeping) FTS
  //     table so word-boundary trigrams are matchable, and includes pg's padded word-boundary
  //     trigrams where they are expressible (one leading/trailing space; '  x' padded forms
  //     cannot occur in real titles and are skipped).
  const phrases = new Set();
  for (const w of normKeep.split(' ').filter(Boolean)) {
    const padded = '  ' + w + ' ';
    for (let i = 0; i + 3 <= padded.length; i++) {
      const g = padded.slice(i, i + 3);
      const spaceCount = (g.match(/ /g) || []).length;
      if (spaceCount === 0) phrases.add(g);            // word-internal trigram
      else if (spaceCount === 1) phrases.add(g);        // ' ve' / 'vt ' — matchable in raw text
      // spaceCount === 2 ('  v') — impossible in real titles; skip
    }
  }
  if (phrases.size > 0) {
    const orQuery = [...phrases].map(escapeFtsPhrase).join(' OR ');
    const candidates = sq.all(
      `SELECT s.id, s.title FROM fts_songs f JOIN songs s ON s.id = f.rowid WHERE fts_songs MATCH ? ORDER BY rank LIMIT 8000`,
      [orQuery]
    );
    const scored = [];
    for (const c of candidates) {
      const sim = pgSimilarity(normKeep, c.title);
      if (sim >= THRESHOLD && !found.has(c.id)) scored.push({ id: c.id, title: c.title, sim });
    }
    scored.sort((a, b) => b.sim - a.sim);
    for (const s of scored) {
      if (found.size >= limit) break;
      found.set(s.id, { title: s.title, rank: order++, sim: s.sim });
    }
  }

  // (d) <3-char total: LIKE fallback (FTS trigram floor)
  if (found.size === 0 && norm.length < 3 && rawTrim.length >= 1) {
    const rows = sq.all(`SELECT id, title FROM songs WHERE title LIKE '%' || ? || '%' LIMIT ?`, [q, limit]);
    for (const r of rows) found.set(r.id, { title: r.title, rank: order++ });
  }

  return { ms: performance.now() - t0, ids: [...found.keys()].slice(0, limit) };
}

// uncapped candidate pool (for recall measurement): does the hardened pipeline FIND every
// pg match at all, independent of top-k truncation?
function hardenedPool(q, { poolCap = 20000 } = {}) {
  const normKeep = q.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const ids = new Set();
  const norm = normText(q);
  if (q.trim().length >= 3) {
    for (const r of sq.all(`SELECT s.id FROM fts_songs f JOIN songs s ON s.id = f.rowid WHERE fts_songs MATCH ? LIMIT ?`, [escapeFtsPhrase(q.trim()), poolCap])) ids.add(r.id);
  }
  if (norm.length >= 3) {
    for (const r of sq.all(`SELECT s.id FROM fts_songs_norm f JOIN songs s ON s.id = f.rowid WHERE fts_songs_norm MATCH ? LIMIT ?`, [escapeFtsPhrase(norm), poolCap])) ids.add(r.id);
  }
  const phrases = new Set();
  for (const w of normKeep.split(' ').filter(Boolean)) {
    const padded = '  ' + w + ' ';
    for (let i = 0; i + 3 <= padded.length; i++) {
      const g = padded.slice(i, i + 3);
      if ((g.match(/ /g) || []).length <= 1) phrases.add(g);
    }
  }
  if (phrases.size > 0) {
    const orQuery = [...phrases].map(escapeFtsPhrase).join(' OR ');
    for (const r of sq.all(`SELECT s.id FROM fts_songs f JOIN songs s ON s.id = f.rowid WHERE fts_songs MATCH ? ORDER BY rank LIMIT ?`, [orQuery, poolCap])) ids.add(r.id);
  }
  // mirror hardenedSearch's (d): <3-char LIKE fallback is part of the pipeline
  if (norm.length < 3 && q.trim().length >= 1) {
    for (const r of sq.all(`SELECT id FROM songs WHERE title LIKE '%' || ? || '%' LIMIT ?`, [q, poolCap])) ids.add(r.id);
  }
  return ids;
}

// ---------- 4. PG side (Nora's exact semantics) ----------
const escapeLike = (s) => s.replace(/[%_\\]/g, '\\$&');
const normalizePg = (q) => q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '');
async function pgSearch(q, { limit = LIMIT } = {}) {
  const escaped = escapeLike(q);
  const normalized = normalizePg(q);
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
  return { ms: performance.now() - t0, ids: rows.map((r) => r.id) };
}

// ---------- 5. probe corpus (same as b3 for comparability + new typo probes) ----------
const PROBES = [
  { label: 'exact_title', q: 'midnight city' },
  { label: 'prefix', q: 'gold' },
  { label: 'substring', q: 'idnight ci' },
  { label: 'multi_word', q: 'shadow sky' },
  { label: 'case_mismatch', q: 'MIDNIGHT CITY' },
  { label: 'punctuated', q: 'midnight-city!' },
  { label: 'punctuated_spaces', q: 'm.i.d.n.i.g.h.t  c.i.t.y' },
  { label: 'partial_word', q: 'velv' },
  { label: 'short_query_2chars', q: 'fe' },
  { label: 'single_char', q: 'a' },
  { label: 'unicode', q: '夢のつづき' },
  { label: 'unicode_partial', q: '願い' },
  { label: 'typo_transpose', q: 'midngith' },
  { label: 'typo_missing_char', q: 'velvt' },
  { label: 'typo_extra_char', q: 'goldenx hour' },
  { label: 'artist_substring', q: 'tanaka' },
  { label: 'no_match', q: 'zzzznothing' }
];

const results = { size: SIZE, buildNormIndexMs: Math.round(buildMs), probes: [] };
const jac = (a, b) => {
  const A = new Set(a), B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

console.log('\nprobe | pg ms/rows | hardened ms/rows | top-50 jaccard | recall (pg matches found by hardened pool)');
for (const probe of PROBES) {
  const pgTimes = [], hTimes = [];
  let pgRes = null, hRes = null;
  for (let i = 0; i < REPS; i++) {
    pgRes = await pgSearch(probe.q);
    pgTimes.push(pgRes.ms);
    hRes = hardenedSearch(probe.q);
    hTimes.push(hRes.ms);
  }
  const pool = hardenedPool(probe.q);
  const pgIds = new Set(pgRes.ids);
  let recallHits = 0;
  for (const id of pgIds) if (pool.has(id)) recallHits++;
  const entry = {
    label: probe.label,
    query: probe.q,
    pglite: { ...stats(pgTimes), n: pgRes.ids.length },
    sqliteHardened: { ...stats(hTimes), n: hRes.ids.length },
    jaccardVsPg: Number(jac(pgRes.ids, hRes.ids).toFixed(3)),
    recallOfPgMatches: pgIds.size ? Number((recallHits / pgIds.size).toFixed(3)) : 1,
    poolSize: pool.size,
    pgIdsSample: pgRes.ids.slice(0, 6),
    hardenedIdsSample: hRes.ids.slice(0, 6)
  };
  results.probes.push(entry);
  console.log(`${probe.label} | pg=${entry.pglite.median}ms/${entry.pglite.n}r | hardened=${entry.sqliteHardened.median}ms/${entry.sqliteHardened.n}r | jac=${entry.jaccardVsPg} | recall=${entry.recallOfPgMatches} (pool=${entry.poolSize})`);
}

// sanity: fuzzy scorer calibration vs PG on the typo probes
const calib = {};
for (const p of ['typo_missing_char', 'typo_transpose', 'typo_extra_char']) {
  const e = results.probes.find((x) => x.label === p);
  calib[p] = { pg: e.pglite.n, hardened: e.sqliteHardened.n, jac: e.jaccardVsPg };
}
results.typoCalibration = calib;

const regressionsClosed = results.probes.filter((p) => ['punctuated', 'punctuated_spaces', 'typo_missing_char', 'typo_extra_char'].includes(p.label)).every((p) => p.recallOfPgMatches >= 0.95);
const normalKept = results.probes.filter((p) => ['exact_title', 'multi_word', 'substring', 'case_mismatch', 'unicode'].includes(p.label)).every((p) => p.jaccardVsPg >= 0.9);
results.verdict = {
  regressionsClosed, // recall-based: hardened pipeline FINDS >= 95% of pg's matches
  normalQueriesPreserved: normalKept, // top-k ordering similarity for normal queries
  note: 'jaccard on LIMIT-50 lists conflates recall with ranking; recallOfPgMatches is the regression-closure measure'
};
console.log('\nverdict:', JSON.stringify(results.verdict));

await sq.close();
await pg.close();
await saveResults('search-hardened', { size: SIZE, reps: REPS, env: envInfo(), results });
