# Nora → SQLite Migration Surface Map

Derived from full reconnaissance of `src/main/db/`, `src/main/db/queries/`, `src/main/search/`,
`src/main/collections/`, `src/main/core/`, `src/main/workers/`, `resources/drizzle/`, and the
integration test suite (branch `sqlite3`, Nora 4.0.0-alpha.4, drizzle-orm 0.45.2, PGlite 0.4.6,
Electron 41.7.2 / Node 24.15). Ground-truthed against the POC in this directory.

## 1. Current architecture facts that constrain the migration

| Fact | Location | Consequence |
|---|---|---|
| PGlite is created at **module load** (top-level `await PGlite.create`), extensions + migrate + seed as side effects | `src/main/db/db.ts:59-107` | SQLite init is synchronous and ~100× faster; the whole module-load chain simplifies |
| DB lives entirely in the **main process**; the one utilityProcess worker never touches it (enforced invariant) | `src/main/workers/process/mediaWorker.ts:1-9`, `MediaWorkerBridge.ts` | Engine swap is invisible to workers — zero worker code changes |
| Exactly **one** production nested-transaction (SAVEPOINT) site: per-track savepoint inside per-100-track batch tx | `src/main/core/songWorkerPool.ts:262-304` | drizzle sqlite-proxy generates identical `SAVEPOINT sp0` SQL (verified: b5 + b12 PASS) |
| 58 `db.transaction(` call sites across `src/main` | grep | All are drizzle `.transaction()` calls → mechanical re-target to sqlite-core |
| Shutdown barrier: "no DB job executing when `closeDatabaseInstance()` is called", 5s hard timeout | `src/main/lifecycle/ShutdownCoordinator.ts:107-120` | SQLite close is ~1-5ms (plus checkpoint); POC verified no new race (b8) |
| Export/import via `pglite.clone()` + `pgDump` | `db.ts:128-166`, `core/exportAppData.ts:37`, `core/importAppData.ts:29` | **No SQLite equivalent of pgDump in-process** — must be replaced (see §5) |
| Migrations: 26 journal entries / 27 SQL files, applied by drizzle pg migrator | `resources/drizzle/` | Must be regenerated for SQLite; history cannot be replayed (see §4) |

## 2. Schema translation (42 tables)

POC prototype (b10-migration) translates **all 42 tables generically** via type rules and
verified lossless row copy at 1.3k and 50k songs. The production schema should be a
hand-written drizzle sqlite-core schema (regenerable with drizzle-kit), with these mappings:

| PostgreSQL | SQLite | Risk |
|---|---|---|
| `integer ... GENERATED ALWAYS AS IDENTITY` (35 tables) | `INTEGER PRIMARY KEY` (rowid alias) | Low. Note `metadata_undo_snapshots.seq` is a **second** identity column (schema.ts:532) — SQLite allows one rowid alias; needs manual sequence (max+1 in tx) or re-key |
| `citext` generated columns ×5 (`name_ci`/`title_ci`) | `TEXT GENERATED ALWAYS AS (lower(x)) STORED` | **Medium**: PG `lower()` is locale-aware; SQLite `lower()` is ASCII-only. Affects Turkish İ/ı, Greek Σ. CJK (caseless) unaffected. Optionally compile ICU extension into Node/Electron (not available in stock node:sqlite) |
| `GIN ... gin_trgm_ops` ×5 (artists/songs/albums/genres/playlists `_ci`) | FTS5 external-content `tokenize='trigram'` tables + triggers | **High** — semantic gaps documented in search-comparison.md (punctuation-insensitive and missing-letter-typo matching regress; <3-char queries need LIKE fallback) |
| `numeric(10,3)` / `numeric(5,1)` / `numeric(8,3)` / `numeric(12,3)` | `REAL` | Low (durations/percentages; float64 exact enough at these magnitudes). PG returns numeric as **string** via driver — Nora already parses; SQLite returns numbers |
| `timestamp` / `timestamp with time zone` (spotify tables) | `TEXT` ISO-8601 fixed-width | Low, **but** see timezone finding: PG `NOW()` on timestamp-without-tz is session-TZ dependent (PGlite on this machine ran +05:30 → `in_last` smart-playlist cutoffs were shifted vs UTC-stored values). SQLite text+UTC is *more* deterministic. Smart playlist compiler must switch to `datetime('now','-N days')` |
| `pgEnum` (artwork_source, swatch_type, lyrics_provider) | `TEXT + CHECK IN (...)` | Low |
| `json` / `jsonb` (9 columns incl. `rule_ast`, `tags`, `payload`, `scopes`) | `TEXT` (JSON1 available and compiled in) | Low — no app SQL queries *inside* JSON today |
| `varchar(n)` | `TEXT` | Low — length not DB-enforced (app validates) |
| ON CONFLICT targets: `artworks.hash` unique, `genres.name_ci` unique citext index, `(entity_kind,entity_id,field_id)`, `songPath` | Unique indexes on generated `lower()` columns / plain columns — SQLite upsert works | Low — verified in b11 (hash dedup) |
| FKs with `ON DELETE CASCADE / SET NULL` (all junctions) | identical syntax | Low — cascade verified in b11 mass-deletion |

Omitted-from-POC PG features (also absent from Nora's usage): LISTEN/NOTIFY (only a logging
listener, `db.ts:65-67`), advisory locks, `FOR UPDATE`, partial/expression indexes, sequences
beyond identity, array columns (the one raw `array_agg` in `CollectionDiagnostics.ts:55` must
become `group_concat` or a JS join — 1 call site).

## 3. Query-layer rewrites (by file, PG-specific constructs)

Category B (semantic rewrite) call sites found by recon; each has a verified SQLite equivalent
from the POC unless noted:

- **Search engines ×5** (`src/main/search/engines/*.ts:26-46`) — the big one.
  `ILIKE`+`regexp_replace`+`%`+`similarity()` → FTS5 trigram + LIKE fallback + JS tier logic.
  See search-comparison.md. Estimate: rewrite each engine's WHERE/ORDER BY; keep
  `SearchCoordinator`, `normalizeQuery`, `computeTier` unchanged.
- **SmartPlaylistCompiler.ts:35-70** — `ILIKE` → `LIKE` (ASCII-CI ok), `= true/false` → `= 1/0`,
  `NOW() - (v || ' days')::interval` → `datetime('now', '-' || v || ' days')`. All rules
  verified result-set-identical on 50k rows (b9).
- **scrobble_queue.ts:103-138** — `NOW()`, `NOW() - (TTL * INTERVAL '1 day')`, `CASE WHEN` update → `datetime('now')` equivalents. Mechanical.
- **analytics.ts** — `count(*)::int`, `::float`, `to_char(createdAt,'YYYY-MM-DD')` → `strftime('%Y-%m-%d',...)`, `extract(hour from ...)` → `strftime('%H',...)`. Mechanical; `orderBy(sql\`count(*) DESC\`)` unchanged.
- **songs.ts:451-544, 622-632** — `EXISTS` subqueries (fine), `::text` casts (drop),
  `btrim()` → `trim()`, raw `SELECT DISTINCT ... UNION` over metadata_overrides (fine),
  500-id chunking (fine). Mostly mechanical.
- **genres.ts:128-135** — upsert on citext unique index → upsert on `lower(name)` unique index. Low risk.
- **artworks.ts:210-214** — five `NOT EXISTS` sweep → identical (verified b11 §3).
- **artists.ts:228** — latent bug: raw SQL references non-existent table `"artistsSongs"` — fix opportunistically during migration.
- **PlaylistRepository.ts:126,137,309** — `count(*)::int` and the `unnest`-style batch VALUES
  `(u.entryId::int, u.position::int)` — the latter is PG-flavored pseudo-SQL inside drizzle
  `sql` template; needs a real rewrite to a VALUES list or per-row inserts.
- **recovery.ts / listens.ts / history.ts / recentlyAdded.ts** — `::int` casts, `ilike(path,'%.wav')` → `LIKE`. Mechanical.

## 4. Migrations for *new installs* vs *existing users*

- New installs: regenerate a SQLite migration set with drizzle-kit (`dialect: 'sqlite'`).
  The 26 PG migration files do **not** port as-is: `0000_init.sql` contains identity syntax,
  citext casts and `USING gin (...)`; `0023_dedupe_genres_and_unique_name_ci.sql` is
  hand-written PG data migration (window functions + `DELETE ... USING`). For fresh SQLite DBs
  these are unnecessary — you ship one baseline schema at the *current* shape instead.
- Existing users: one-time data migration (§5), not SQL migration replay.

## 5. Existing-user data migration (POC-verified)

`b10-migration.mjs` implements a generic exporter/importer:

1. Open old PGlite data dir (`nora.pglite.db`).
2. Introspect `information_schema` for all 42 tables + columns.
3. Generate SQLite DDL via type rules (§2).
4. Copy rows table-by-table inside transactions (bool/timestamp adapters).
5. Verify per-table counts + field fidelity.

**Measured**: 1.3k songs → 2s; 50k songs → 32s (DDL 43ms + copy 32s), all table counts match,
favorites/artwork/override fidelity verified, output 47.1 MB vs 385 MB PGlite dir.
Roughly 2 min for a 200k-song extreme library at this throughput (~1.6k rows/s dominated by
PGlite read speed).

Things the production migrator must add on top of the POC:
- Ship inside the app: run on first launch of the SQLite build, against the real userData dir;
  keep the old PGlite dir as backup until verified, then offer cleanup (frees ~8× disk).
- `metadata_undo_snapshots.seq` manual sequence handling.
- FTS5 index build after copy (POC DBs don't ship FTS tables; add `INSERT INTO fts_... SELECT ...` once).
- A progress UI; migration is a blocking first-launch step for large libraries.

## 6. Category estimates (Phase 14)

| Category | Scope | Files | Est. LOC | Difficulty |
|---|---|---|---|---|
| A. Mechanical (driver/dialect re-target) | db.ts singleton, query files casts, settings/prefs, queue | ~25 | ~600 | Low |
| B. PG semantic rewrites | SmartPlaylistCompiler, scrobble_queue, analytics, playlists batch VALUES | ~10 | ~400 | Medium |
| C. Search rewrites | 5 engines + FTS5 schema + triggers + <3-char + punct/typo strategy | ~8 | ~700 | **High** |
| D. Schema rewrites | sqlite-core schema for 42 tables + indexes + FTS5 + triggers | 2-3 | ~1200 (mostly generated) | Medium |
| E. Data conversion | Exporter/importer (POC exists, needs app integration) | ~4 | ~600 | Medium |
| F. Test rewrites | 9 test/ files + 4 src test files hit PGlite; savepoint/cascade/shutdown ports already POC-proven | ~13 | ~1500 | Medium |
| G. Packaging | **None for node:sqlite** (compiled into Electron's Node; no npmRebuild, no asarUnpack, verified in real Electron 41 main process) | 0 | 0 | Low |
| H. Runtime lifecycle | db.ts init (simplifies), close (simplifies), export/import feature rework | ~4 | ~250 | Low-Med |
| I. Performance regressions | None measured; all engine metrics improved. Only FTS maintenance cost on writes (still 8-19× faster than PGlite) | 0 | 0 | Low |
| J. Behavioral regressions | punct/typo search semantics; PG-locale lower() edge cases; PG NOW() session-TZ behavior changes (arguably a fix); `deletePlaylists` result shape | — | — | Medium, needs product sign-off on C |

Overall: the engine swap itself (A/D/H/G) is small and mechanical because DB ownership was
already centralized and workers are DB-free. The real cost is concentrated in **C (search)**,
**E (user migration)** and **F (tests)**.
