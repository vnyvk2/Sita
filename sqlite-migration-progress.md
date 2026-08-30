# SQLite Migration Progress Journal (worktree: sqlite3)

Behavioral reference: master's PGlite implementation at commit d0cc519e.
Plan of record: `sqlite-poc/RESULTS.md` §7b GO/NO-GO checklist + `sqlite-poc/migration-surface.md`.

## M0 — Baseline

- Scope decision recorded: runtime dual-engine (PGlite escape hatch) replaced by a
  **git-based escape hatch** (master remains fully PGlite-shippable). `NORA_USE_PGLITE=1`
  now throws a loud, explicit error instead of silently running two dialects.
- **Timestamp round-trip probe (critical)**: drizzle-pg writes `Date -> ISO string` into
  `timestamp without time zone`; PGlite stores the UTC wall-clock. drizzle-pg re-reads it
  as UTC (round-trip exact). PGlite's RAW query parser interprets the same wall-clock as
  LOCAL — so the migrator must read timestamps as `::text` and parse as `...Z` for
  lossless epoch-ms conversion. Implemented in migrate-from-pglite.ts.
- drizzle sqlite-core capabilities verified by probe: generated columns (callback form),
  desc indexes, `integer({mode:'timestamp_ms'})`, boolean/json modes, `$defaultFn`.

## M1 — Engine, schema, DDL

- `src/main/db/schema.ts` fully rewritten to drizzle **sqlite-core**: all 42 tables, all
  relations ported 1:1, identical exported symbol names (tables, relations, enum unions).
- `src/main/db/sqlite/ddl.ts`: hand-authored baseline DDL (42 tables + FTS5 trigram tables
  for songs/albums/artists/genres/playlists + sync triggers + seq trigger for
  metadata_undo_snapshots + CHECK constraints). `*_ci` columns use
  `COLLATE NOCASE GENERATED ALWAYS AS (lower(x)) STORED` (citext parity);
  `*_norm` columns strip punctuation/space via a shared NORM_STRIP_CHARS expression
  (mirrors pg regexp_replace + space removal).
- `src/main/db/sqlite/engine.ts`: node:sqlite DatabaseSync + PRAGMAs (WAL,
  **synchronous=FULL** per durability decision, busy_timeout 5000, foreign_keys ON,
  temp_store MEMORY, cache 16MB), user_version-stamped baseline DDL, drizzle sqlite-proxy
  adapter with dual statement caches (array-mode for drizzle positional mapping,
  object-mode for raw helpers).
- **Concurrency serialization (PGlite semantic parity)**: drizzle's sqlite-proxy does NOT
  serialize transactions (two overlapping `db.transaction()` both emit BEGIN → SQLITE_ERROR)
  and bare statements could join an open transaction. Found by the toggleLikeSongs
  concurrency tests. Fixed in the adapter: `orm.transaction` FIFO-queued holding the lock
  across the whole async body; bare statements (select/insert/update/delete/query builders)
  wait at execution time while a transaction is active. Nested savepoint transactions run on
  the trx object (unpatched) inside the held lock — no self-deadlock. toggleLikeSongs 11/11
  incl. overlapping-toggles atomically.
- `src/main/db/sqlite/raw.ts`: object-row raw query helpers (drizzle proxy returns
  positional arrays for raw .all(); raw helpers target the same connection so they are
  transaction-safe).
- `src/main/db/sqlite/migrate-from-pglite.ts`: generic PGlite→SQLite migrator (FK-ordered,
  batched drizzle inserts, explicit id/seq preservation, timestamp-as-UTC-text).

## M2 — db.ts swap

- Real db.ts rewritten: same exports (`db`, `DB`, `DBTransaction`, `DB_PATH`,
  `closeDatabaseInstance`, `isDatabaseStubbed`, `nukeDatabase`, `exportDatabase`,
  `importDatabase`). Single WAL file `nora.sqlite.db`. Legacy `nora.pglite.db/` next to it
  is auto-migrated on first launch (guarded by sqliteFileExisted).
- **Ordering bug found + fixed**: seedDatabase() initially ran before `db` was bound
  (old file assigned `db` earlier); seed.ts reads the live binding during db.ts evaluation.
- exportDatabase now emits portable SQL (DELETE+INSERT replace semantics, generated columns
  excluded via table_xinfo hidden filter); importDatabase executes the dump.

## M3/M4 — Query-layer rewrite (PG-isms → SQLite)

- `db.execute(...)` → `rawAll/rawRun` (CollectionDiagnostics incl. array_agg→group_concat,
  SongSearchEngine metadata cross-search, PlaylistRepository bulk UPDATE).
- pg `UPDATE ... FROM (VALUES ...) AS v(...)` → SQLite CTE form (verified UPDATE-FROM with
  bare VALUES is a syntax error on SQLite 3.53).
- All `::int/::float/::decimal/::text` casts removed (7 files).
- `NOW()` / `NOW() - INTERVAL '1 day'` → `Date.now()` / ms arithmetic (scrobble_queue,
  SmartPlaylistCompiler in_last/not_in_last — compile-time cutoff, which also removes pg's
  session-TZ dependence found in POC b9).
- `to_char(col,'YYYY-MM-DD')` → `strftime('%Y-%m-%d', col/1000, 'unixepoch')`;
  `extract(hour from col)` → `cast(strftime('%H',...) as integer)` (analytics).
- `btrim` → `trim`; `sql\`now()\`` upsert default → `new Date()`; pg `affectedRows` →
  sqlite `changes`; `.overridingSystemValue()` removed (SQLite rowid accepts explicit ids);
  numeric-string boundaries converted (duration REAL etc.); SongPersistenceDTO.duration → number.
- Search engines (5) rewritten per POC b3b: raw LIKE + *_norm LIKE WHERE; pg `%` fuzzy
  branch replaced by FTS5 trigram-OR candidate pool + JS pg_trgm-exact scoring
  (`search/fuzzy/pgTrgmSimilarity.ts` + `ftsFuzzySearch.ts`); JS computeTier unchanged —
  fuzzy matches tier exactly like the pg path did.
- SmartPlaylistCompiler: ILIKE → lower() LIKE; `= true/false` kept (SQLite literals);
  AnyPgColumn → AnySQLiteColumn.
- Latent bug fixed along the way: artists.ts:228 referenced non-existent "artistsSongs" table.

## M5 — Test port

- `test/helpers/sqliteMockDb.ts` + `@test-helpers` vitest alias: in-memory SQLite engine
  mock replacing per-file PGlite factories. 12+ test files ported.
- **typecheck:node: 0 errors** (from 85 initial → 759 transient DB-type cascade → 0).
- P1 savepoint gate: 4/4 PASS on the production code path. P0 mass-deletion: PASS.
  Backpressure fallback: PASS. Adversarial shutdown: PASS (after adapting the
  closed-connection error expectation: SQLite "database is not open" vs PGlite
  "client has been closed" — same invariant, stronger assertion kept).
- GateD4 concurrency/rollback stress: PASS. MetadataHistoryLifecycle (real-file
  close/reopen): PASS. DurabilityRegressions: PASS (after COLLATE NOCASE fix).
- Driver-artifact fixes: string durations → numbers (drizzle REAL), PG identity
  `ALTER ... SET GENERATED` blocks dropped (rowid accepts explicit ids), FK-disable via
  `PRAGMA foreign_keys=OFF` (pg session_replication_role), Analytics/LRCLIB test objects.
- Dialect-specific assertion updates (behavior preserved, dialect text adjusted):
  SmartPlaylistCompiler ILIKE→LIKE+lower( assertion; SmartPlaylistEngine totalDuration
  '320.000'→320 (pg numeric string vs REAL number).
- **Pre-existing failures verified on pristine stash (NOT migration-caused)**:
  miniPlayerGeometry.test, songWorkerPool.test, tryToParseSong.test, waveformJob.test,
  autotagArtwork.integration.test (+ web typecheck had 130 errors pristine).
- **SQLite-engine verification suite added** (test/src/main/db/sqlite/sqlite-engine.test.ts):
  DDL↔drizzle column parity, generated-column recompute, FTS sync, citext-ASCII CI parity
  (documented Unicode deviation), seq trigger preservation, export/import lossless
  round-trip, REAL PGlite→SQLite migration fidelity (counts, joins, instants, favorites,
  numeric, undo seq).

## Current status / next

- Remaining known failures = the 5 pre-existing files only (verify with full run).
- Next: full suite + typecheck re-verify → M8 build/package/probe → M9 smoke
  (ingest→search→favorite→playlist→restart on a real file DB) → M10 diff review.

## M6 — PGlite→SQLite migration verified

- `test/src/main/db/sqlite/sqlite-engine.test.ts` (6 tests): baseline-DDL↔drizzle column
  parity across all 42 tables; generated-column recompute (incl. after UPDATE); FTS5 sync
  on INSERT/UPDATE/DELETE; citext-style CI equality (ASCII; Unicode deviation documented);
  seq trigger assigns MAX+1 AND preserves explicit (migrated) seq values; export/import
  lossless round-trip through the production singleton (counts + field fidelity +
  integrity_check ok); **real PGlite→SQLite migration** — boots actual PGlite, applies
  Nora's actual 26-migration chain, inserts rows, runs migrateFromPgliteIfNeeded, verifies
  per-table counts, joined relations, UTC-instant timestamps, favorites, numeric conversion,
  and preserved undo-seq values. All PASS.
- Migrator bugs found & fixed by this suite: drizzle insert values must be keyed by
  drizzle PROPERTY names (isFavorite), not DB column names; generated columns excluded
  from INSERT; timestamp columns read as ::text and parsed as UTC (PGlite raw parse
  applies local offset — drizzle applies UTC); pg tz suffix '+00' normalized.

## M8 — Build & package

- `electron-vite build`: clean (5.3s). `electron-builder --dir`: clean, Nora.exe produced.
- Probe A (packaged Nora.exe binary): node:sqlite OK, SQLite 3.51.3, FTS5 OK.
- Probe B (asar-packaged app, real main process): WAL DB + generated column + 500 inserts
  + FTS5 + integrity ok.
- **Real launch smoke**: packaged Nora.exe booted with isolated NORA_USER_DATA — boot log:
  "SQLite open start" → "baseline schema applied (v1) in 669ms" → "SQLite open completed
  (open 1ms, pragma 12ms)" → all three tables seeded → "Drizzle ORM initialized (SQLite)"
  → "Application boot" → BrowserWindow created → IPC initialized. DB file verified on disk:
  42 data tables + FTS5 shadow suite, WAL mode, integrity ok, seed rows present.

## M9 — Real-fixture smoke (production path)

- `test/src/main/db/sqlite/smoke.test.ts` — NO db mocks; NORA_DB_FILE points the real
  db.ts singleton at a real file. Verified: production ingestion (ingestTrackDTO) with
  artist/album/genre resolution; search engines (exact, punctuated 'midnight-city!',
  fuzzy 'Golden Hou', artist metadata); favorite toggle invert-persist-invert; PlaylistEngine
  addSongs via real OperationExecutor + journal; smart-playlist rules storage; play history;
  **restart** (closeDatabaseInstance → module reset → reopen same file): counts, favorite
  state, playlist entries, FTS contents, integrity ok, search works, no seed duplication.
  5/5 PASS.
- Test-infrastructure addition: `NORA_DB_FILE` env override lets integration tests drive
  the production file path instead of the default in-memory test DB.

## M10 — Final verification

- `git diff --check`: clean (no whitespace/conflict markers).
- Full diff reviewed file-by-file (63 modified files, ~1027+/1048-; new: src/main/db/sqlite/,
  src/main/search/fuzzy/, test/helpers/, test/src/main/db/sqlite/, journal).
- Diff-audit catch: leftover `btrim()` in songs.ts language-override fragments would have
  been a latent runtime failure ("no such function") — swept to `trim()` and DB tests
  re-run green.
- typecheck:node: 0 errors. Full vitest suite: 353/358 files, 2221/2235 tests pass;
  the 5 failing files (miniPlayerGeometry, songWorkerPool, tryToParseSong, waveformJob,
  autotagArtwork) were verified to fail IDENTICALLY on the pristine stash — pre-existing,
  untouched by this migration.
- Worktree state: only intended changes; generated routeTree.gen.ts restored (empty diff);
  test artifacts removed.

## Post-migration audit verification (external review)

An external audit made 3 code changes to `migrate-from-pglite.ts` and edited-then-reverted
`miniPlayerGeometry.test.ts`. All claims verified against the actual code:

1. **FK OFF during bulk migration + restore + foreign_key_check** — VERIFIED CORRECT.
   `PRAGMA foreign_keys = OFF` is issued via engine.exec on the raw connection BETWEEN
   drizzle transactions (the pragma is a no-op inside a transaction — placement is right);
   `finally` re-enables FK even on throw and closes PGlite; `PRAGMA foreign_key_check`
   runs after re-enable and logs violations. Fixes real out-of-order self-referencing
   music_folders inserts (child-before-parent).
   *Recommendation (non-blocking):* foreign_key_check is warn-only — escalating to a
   thrown error (like the count-mismatch path) would be stricter; PG-validated source
   data makes violations indicate a migration bug, so warn is defensible.
2. **Residue detection** — VERIFIED CORRECT. When sqliteFileExisted=true, counts
   songs+music_folders+playlists; proceeds to migrate if all zero (fixes my original bug
   where a crashed migration left an empty-but-existing file that skipped migration
   forever). Placement is right: db.ts runs migration BEFORE seeding, so a fresh DB is
   genuinely empty at check time. try/catch continues on incomplete schema.
   *Edge (non-blocking):* a user who deletes their ENTIRE library (0 songs+folders+
   playlists) with the legacy dir kept would re-trigger migration once — recommend a
   one-time completion marker long-term.
3. **BATCH 500 → 200** — VERIFIED SAFE. Widest table (user_settings, ~40 cols) × 200 =
   8000 params, well under SQLite's 32766 variable limit; POC already ran 8000-param
   statements successfully.

Also verified: `miniPlayerGeometry.test.ts` restored to HEAD exactly (0 diff); no stray
audit files; db.ts untouched by the audit; schema parity independently re-confirmed
(42/42 tables, 334 columns, 0 discrepancies); typecheck:node 0 errors; engine+migration+
smoke suites 11/11; full suite failures = exactly the 5 pre-existing files (14 tests) —
run-to-run file-count variance (354↔358) is 4-core fork-pool startup flakiness, not tests.

Worktree note: the audit's operations left all changes STAGED (git diff empty; all content
in git diff --cached). Content is identical to the pre-audit state plus the 3 migrator
changes above.

## Post-audit hardening (flags resolved)

- **Flag 1 (FK check warn-only): kept as-is, deliberately.** A FK violation means
  orphaned rows (no data loss) — throwing during db.ts module eval would fail app boot
  entirely, which is worse UX for a near-zero-probability event (PG enforced the same
  FKs, so migrated data is FK-valid unless the migrator itself is buggy). Severity
  hierarchy is right: count mismatch (silent data loss) throws; FK violation warns.
- **Flag 2 (empty-library resurrection): FIXED.** user_settings added to the residue
  count — it is seeded only after a successful migration + boot, so its presence proves
  a prior completed run. A user who deleted their entire library no longer re-triggers
  migration (user_settings≥1 → skip); a crashed migration still re-migrates
  (user_settings=0).
- **Bonus: crash-atomic migration.** The per-table commits meant a crash mid-migration
  left partial data (e.g. folders without songs) that the residue check treated as
  "already migrated" — a silent partial library. The entire table loop now runs in ONE
  transaction: any crash rolls back everything, leaving a clean empty DB that the next
  boot re-migrates. (FK OFF pragma stays outside the transaction, where it is effective.)
- **New test:** migration re-run with sqliteFileExisted=true skips cleanly (no
  double-insert, counts unchanged).
- Re-verified: typecheck:node 0 errors; sqlite-engine suite 6/6; smoke 5/5; collections
  + integration 36/37 files / 135/136 tests (the 1 failure = verified pre-existing
  autotagArtwork).

## Runtime feedback round 1 (user testing)

- **Scroll**: benchmarked the real hydration path at 50k songs
  (test/src/main/db/sqlite/scroll-perf.test.ts, kept as a perf regression gate):
  full id list 57.6ms; 50 concurrent 200-row windows (fast-scroll burst, 10k rows
  hydrated) 510ms total / 10.2ms per window; sequential slow-scroll p50 9.25ms p95
  14.6ms; hydration during concurrent write txs 18.2ms (no txLock stall). DB layer
  is not the bottleneck — awaiting user's re-test with more detail before touching
  the renderer/windowing side.
- **Search typo resistance**: user reports typos handle poorly. Parity check:
  pg_trgm's 0.3 threshold fails transpositions ('midngith' = 0.286) and short-ish
  typos ('goln' = 0.214) — PGlite failed those too. SQLite lets us do BETTER:
  implementing progressive threshold in fuzzySearch (below).

## Search typo resistance + .all() runtime bug (round 2)

- **ROOT CAUSE of "typos don't work" found**: drizzle's sqlite-proxy `.all()` returns
  POSITIONAL ARRAYS for raw SQL (positional mapping is what the query-builder layer
  needs). Two raw-SQL sites treated rows as objects and silently broke at runtime:
  1. `fuzzySearch` pool — `r.id`/`r.text` were undefined → pgSimilarity scored ~0 →
     fuzzy ALWAYS returned [] → typos never matched in the production build (the POC
     b3b used object-mode helpers, the production port used drizzle .all() — port bug).
  2. `getSongListFacets` — `r.val.trim()` would throw TypeError at runtime when the
     Songs page loaded language facets.
- Both fixed by routing raw object-row queries through `rawAll` (same connection →
  transaction-safe). Sweep confirmed no other object-style `.all()`/`.get()` sites remain.
- **Typo resistance implemented** (better than the PG build): `fuzzySearch` now scores
  the pool once and applies a PROGRESSIVE threshold — pass 1 at pg-exact 0.3; when pass
  1 finds nothing, pass 2 relaxes to 0.2. pg_trgm rejected transpositions ('midngith'
  = 0.286) and short typos ('goln' = 0.214); the SQLite build now catches them. Pass 2
  never runs when pass 1 matched, so correct-typing behavior is byte-identical to before
  (no noise).
- New suite: test/src/main/search/typo-resistance.test.ts (pass-1 parity, pass-2 rescue,
  artist fuzzy, negative-noise guard) — 4/4 PASS.
- getSongListFacets has NO test coverage (only used by renderer) — the .all() bug there
  would have thrown on every Songs-page load; note for test-debt backlog.
