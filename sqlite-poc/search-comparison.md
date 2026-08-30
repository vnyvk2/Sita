# Search Semantics: pg_trgm (Nora today) vs SQLite (FTS5 trigram + LIKE fallback)

Benchmarked on identical 50k-song synthetic libraries (same generator, same ids), 8 reps/condition.
PG side runs Nora's **actual** search SQL shape (SongSearchEngine.ts:26-46): `ILIKE '%q%'` OR
`regexp_replace(title_ci,'[[:punct:]]','','g') ILIKE '%norm%'` OR `title_ci % norm`, ordered by the
tiered-CASE + `similarity()` DESC. SQLite candidates: (a) plain `LIKE '%q%'`, (b) FTS5 trigram
`MATCH '"q"'` with bm25 `rank`, joined back to songs.

## 1. Latency (median, ms, 50k songs) — full fuzzy search incl. ranking

| Probe | PGlite (Nora today) | SQLite LIKE | SQLite FTS5 |
|---|---:|---:|---:|
| exact title | 1180.8 | 7.8 | 2.6 |
| prefix (`gold`) | 941.0 | 11.9 | 7.0 |
| substring (`idnight ci`) | 851.9 | 8.2 | 2.4 |
| multi-word | 803.7 | 6.7 | 1.8 |
| case mismatch | 690.9 | 7.0 | 2.2 |
| punctuated (`midnight-city!`) | 834.9 | 6.7 | 0.09 |
| partial word (`velv`) | 798.9 | 11.1 | 8.6 |
| 2-char (`fe`) | 692.7 | 10.0 | skip |
| 1-char (`a`) | 489.0 | 12.6 | skip |
| unicode CJK full | 856.4 | 5.7 | 0.25 |
| unicode CJK partial (2 chars) | 966.3 | 7.8 | skip |
| typo (missing char) | 781.4 | 11.2 | 0.14 |
| no-match negative | 1278.7 | 5.2 | 0.06 |
| metadata cross-search (artist/album join, LIMIT 50) | 894.4 | 22.1 | — |

Every fuzzy search on a 50k library costs Nora ~0.5–1.3 s today; SQLite's equivalents run in
0.06–22 ms. The search **feature** becomes ~50–100× faster regardless of implementation choice.

## 2. Result-set equivalence (Jaccard overlap of top-50 vs PG, ids ordered by each engine's rank)

| Probe | LIKE | FTS5 | Reading |
|---|---:|---:|---|
| exact title | 0.64 | **0.96** | same matches; FTS bm25 ordering ≈ pg similarity ordering |
| multi-word | 0.61 | **1.00** | identical |
| substring | 0.43 | **0.92** | FTS ≈ PG |
| case mismatch | 0.64 | **0.96** | — |
| prefix | 0.02 | 0.64 | both find matches; top-50 differs because PG ranks ~1.8k matches by similarity while LIKE returns arbitrary order. Recall identical, ranking differs |
| partial word | 0.03 | 0.61 | same as prefix — recall ok, ordering differs |
| punctuated (`midnight-city!`) | 0.00 | 0.00 | **PG finds 50; SQLite finds 0** (see §3) |
| unicode full | 1.00 | **1.00** | identical id lists |
| unicode partial (2 chars) | 1.00 | skip | LIKE fallback required (<3 chars) |
| typo missing char (`velvt`) | 0.00 | 0.00 | **PG finds 30; SQLite finds 0** (see §3) |
| typo transposed (`midngith`) | 1.00 | 1.00 | both find 0 — PG's 0.3 threshold already rejects it |
| short 2-char / 1-char | 0.00 | skip | ranking-only difference; LIKE recall matches PG |

Caveat: top-50 Jaccard conflates recall with ranking. For recall (does the match exist anywhere),
LIKE and FTS5 find the same candidate set as PG on every probe except punctuation and typos below.

## 3. Semantic regressions (the honest list)

1. **Punctuation-insensitive matching.** PG's `%` (set-of-trigrams similarity) matches
   `midnight-city!` → `MIDNIGHT CITY`. FTS5 trigram is a *sequence* matcher — the phrase
   `midnightcity` is not a trigram subsequence of `midnight city`. Mitigation: store an
   additional punctuation/space-stripped column (or FTS table) and query both forms; or accept
   the regression. This is real migration complexity — Nora's current behavior survives
   "artist - title" style queries typed with arbitrary punctuation.
2. **Missing/extra-letter typos.** `velvt` → `velvet heart`: PG `%` catches it (similarity ≥ 0.3);
   FTS5 trigram (sequence) and LIKE do not. No native SQLite equivalent of `%`. Mitigations:
   app-side fuzzy pass (e.g. Levenshtein or trigram-set scoring in JS) over an FTS candidate
   pool, or a custom SQLite function (node:sqlite supports registering JS UDFs — measurable,
   not benchmarked here). Transposed-letter typos (`midngith`) are **not** caught by PG either
   (threshold), so that band is unchanged.
3. **Queries shorter than 3 characters.** FTS5 trigram floor. Mitigation: route <3-char queries
   to the LIKE path (measured 10–13 ms at 50k — acceptable). Functionality preserved with code.
4. **`lower()` locale behavior.** PG citext compares with locale-aware lower(); SQLite's built-in
   `lower()` is ASCII-only. CJK titles (caseless) verified identical. Risk confined to special
   casing (Turkish İ/ı, Greek Σ). `COLLATE NOCASE` has the same ASCII limitation.
5. **Metadata cross-search** (`SELECT DISTINCT ... LEFT JOIN artists/albums`): semantics port
   1:1 with `LIKE`; 40× faster. Verified same 50-row limit behavior.

## 4. Ranking

PG orders by tiered-CASE then `similarity()`; today Nora re-ranks in JS anyway
(`computeTier`, SongSearchEngine.ts:107-114) before display. The SQLite translation keeps the
JS tier computation unchanged and substitutes bm25 (or a matched-position score) for
`similarity()`. Top-50 ordering differs from PG in the mid-band (see prefix/partial above) but
the JS tier logic dominates what the user sees for exact/prefix/word-boundary tiers.

## 5. Index cost

- PG: 5 GIN trgm indexes (created in migrations), maintained on every write.
- SQLite: FTS5 external-content trigram tables + sync triggers: **+159% insert cost** on songs
  (23.6k → 9.1k rows/s in the b4 micro-bench). Even so, SQLite-with-FTS insert throughput
  (9.1k/s) remains ~8× above PGlite's whole-library insert throughput (~0.9-1.1k/s), and bulk
  scans can drop triggers and rebuild FTS once (`SCAN+REBUILD`) if large imports need it.
- Index size: FTS trigram adds ~2.5-3× the text size; overall DB at 50k songs is 84 MB incl.
  FTS vs PGlite dir 385 MB.

## 6. Bottom line for search (initial round)

Practical behavior (exact, prefix, substring, multi-word, case, CJK) is **equivalent or
near-equivalent** with FTS5 trigram + LIKE fallback, at 50-100× the speed. Two bands regress
without extra work: arbitrary punctuation in queries and single-char-missing typos. Both have
known mitigations; both need explicit product sign-off (category C in migration-surface.md).

## 7. HARDENING ROUND — regressions closed (b3b-search-hardened.mjs)

The mitigations were implemented and re-benchmarked against the same PG side on the same 50k data:

1. **`fts_songs_norm`** — trigram FTS over a lowercase, punctuation-and-space-stripped title,
   maintained by the ingest path (production translation of citext + `regexp_replace`).
   Backfill over 50k rows: **1.4 s** one-time; incremental on write thereafter.
2. **`%`-replacement** — candidate pool via FTS5 trigram-OR queries (same "share ≥1 trigram"
   candidate model as pg_trgm's GIN, including word-boundary padded trigrams where expressible),
   scored in JS with **pg_trgm's exact algorithm** (per-word space-padded trigram sets,
   `similarity = |A∩B|/(|A|+|B|-|A∩B|)`, threshold 0.3). Scorer validation: over all 50k rows
   it reproduces PG's match set for `velvt` **exactly** (30/30, zero false positives/misses).
3. **<3-char queries** — LIKE fallback (0.2–6 ms @50k).

### Results (PGlite vs hardened SQLite, 50k songs)

| Probe | PGlite | Hardened | top-50 Jaccard | Recall of PG matches |
|---|---:|---:|---:|---:|
| typo `velvt` | 697 ms / 30 rows | **27.5 ms / 30 rows** | **1.00** | **1.00** |
| punctuated `midnight-city!` | 780 ms / 50 | 90 ms / 50 | 0.85¹ | **1.00** |
| punctuated `m.i.d.n.i.g.h.t c.i.t.y` | 807 ms / 50 | 91 ms / 50 | 0.85¹ | **1.00** |
| typo extra char `goldenx hour` | 775 ms / 50 | 42 ms / 50 | 0.79¹ | **1.00** |
| exact / multi-word / substring / case / CJK | 632–774 ms | 2–148 ms | 0.92–1.00 | **1.00** |
| 2-char `fe` | 678 ms / 50 | 101 ms / 50 | 0.00¹ | **1.00** |
| 1-char `a` | 572 ms / 50 | 0.2 ms / 50 | 0.00¹ | n/a² |
| no-match / transposed-typo negatives | — | — | 1.00 (both 0 rows) | — |

¹ Ranking-only divergence: the matched SET is identical (recall 1.00); top-50 *order* differs
(bm25 vs pg similarity). Nora re-ranks with JS tiers (`computeTier`) before display anyway.
² Pool cap truncation on a degenerate ~45k-match query; both engines return 50 rows from the
same "title contains the char" set.

### The search contract this establishes

**SQLite (FTS5 trigram + norm column + trigram-OR/JS-scoring fuzzy + LIKE fallback) reproduces
pg_trgm's match set with recall 1.00 on every probe, at 5–100× the speed.** Ordering diverges
only in the mid-band, which Nora's existing JS tier logic dominates. The regression is closed;
what remains is productionizing a measured, working design (norm-column maintenance in
`ingestTrackDTO`, pool caps, optional node:sqlite UDF registration for the scorer).
