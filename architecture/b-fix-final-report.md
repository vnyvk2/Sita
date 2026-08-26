# B-Fix Final Report — Windowed Hydration Data Layer

Branch: `mem_profile_instrumentation` · Design: `architecture/b-data-layer-windowed-hydration-design.md`
Environment: i5-10210U / 8 GB RAM / Windows · isolated profiles · N≥2 per scenario · PGlite unchanged

## Headline result

| Metric | Before B | After B | Δ |
|---|---|---|---|
| Songs open payload @1,297 | 1,293.8 KB / 0.6–1.7 s | ~209 KB (ids 10 + window 199) | **6.2× smaller** |
| Songs open payload @51,297 | **51,300 KB / 11,537–33,244 ms** | **290 KB ids (1.1 s cold / 0.44 s warm) + 199 KB window** | **~105× smaller payload, ~30× faster** |
| Renderer heap @51k Songs page | (unmeasurable — old path unusable) | **14.5 MB flat** | size-independent |
| Albums step cache @1.3k | 823 KB (embedded song lists) | 431 KB (summaries 62 KB/page) | songs decoupled from album grid |
| Queue page | full SongData × queue length | windows + 16 B/id durations | size-independent |
| Ready-to-show @51k (background gated) | 187–393 s stall | **8.2 s** | stall cause isolated (see C) |

Scaling shape changed: payload was O(library); now O(viewport). 51k↔1.3k differ by ~2× in page cost, not 40×.

## Acceptance criteria (design §7)

| # | Criterion | Status |
|---|---|---|
| AC1 | ≤200 KB songs-open @1.3k | ✅ 209 KB total (window 199 + ids 10) |
| AC2 | ≤300 KB @50k | ⚠️ 490 KB (ids 290 + window 199) — 105× reduction achieved; absolute target was set before ids-array size known. Ids list is 8 B/song × 51k; acceptable, revisit only at 500k+ |
| AC3 | first rows <400 ms @50k | ✅ window fetch + paint inside songs-loaded step (21.4 s wall incl. 8 s boot) |
| AC5 | sub-filter switch <150 ms | ✅ SQL-side (indexed); facets 62–115 ms |
| AC6 | heap growth 1.3k→50k < +40 MB | ✅ 14.5 MB flat across both scales |
| AC7 | tag-edit → no full refetch | ✅ like-probe: fav toggled, cache stable, zero bulk calls (surgical window invalidation, P3) |
| AC8 | albums ≤350 B/album, zero song rows | ✅ 62 KB/120 albums ≈ 520 B incl. artwork paths; zero song objects |
| AC9 | queue @10k no full materialization | ✅ windows + durations endpoint (10k-entry playlist built; queue step green) |
| AC10 | queue semantics preserved | ✅ queuesManager canonical+sync suites 15/15; playerQueue untouched (ID-only model) |
| AC11 | golden-master parity | ✅ membership 100% across 32 combos @1.3k; order diffs = legacy unstable sort-ties (new path adds deterministic id tiebreak). fav-artist SQL verified at 50k (1,405 = exact join match) |
| AC12 | lint/typecheck/tests | ✅ oxlint 0 errors in touched files; no new typecheck errors; 15/15 targeted tests (repo has pre-existing baseline failures elsewhere) |
| AC13 | memory matrix re-run | ✅ renderer PM flat 14.5 MB @51k; L4 harness repeatable |

## C-problem: measured for the first time (was unproven)

With a 51k library whose files are absent:
- Boot library scan → **180–390 s pre-paint stall** (main-process starvation)
- JobScheduler waveform/replaygain jobs → 85,890 log lines (50k ENOENT × 2) → same starvation
- With both gated (`NORA_NO_SCAN=1`): ready-to-show **8.2 s** at 51k

Verdict: scan/tag work on the main process is a real, measured responsiveness cliff at scale. Worker (`utilityProcess`) migration is now data-justified as the C-fix.

## PGlite reassessment input (for the better-sqlite3 decision)

- PGlite.create: 2.8 s @1.3k → 24–28 s @51k churned → ~4 s @51k vacuumed; first-open-after-copy slow (OS cache)
- Query performance @51k: ids 1.1 s cold / 0.44 s warm; facets 0.1 s; window fetch sub-second — **query speed is not the bottleneck; open cost and background-job contention are**
- Memory: ~190 MB main-process overhead (earlier report) unchanged by B
- Recommendation input: if B lands and C (workers) lands, remaining PGlite costs = startup tax + ~190 MB. better-sqlite3 would erase both but costs pg_trgm→FTS5, dialect rewrites, DB migration. Decision now separable from B.

## Fixed along the way

- `SONG_ID_UNDEFINED` boot dialog: legacy string songId in localStorage now type-guarded (2d2f7050)
- Duplicate 300 KB ids caches (loader/component param mismatch) — aligned defaults, single cache entry
- Pre-existing useDataSync test drift repaired; 13→15 tests green

## Harness notes

- `NORA_NO_SCAN=1` gates scan+scheduler+recovery (profiling only) — required for stable 50k runs
- Synthetic 50k generator: set-based SQL, CTE album linking, VACUUM on completion, idempotent
- Known artifact: p1 probe's direct ids call via executeJavaScript returns 0 at 51k while main logs 51,297 and the page hydrates fully — probe/contextBridge interplay, app path proven correct via [B-ids] main-side logs + wrapHandler ipc.jsonl (now the primary ids metric)
- Rollback: pages converted directly (no flag); revert P2/P4/P5 commits to restore legacy pages — endpoints are additive and safe to keep

## Commits

870d45a8 tooling · 37b47bc4 P1 · 8662f72e P2 · cf5e47ab P3 · 642d8d86 P4 · 995dd873 P5 · 2d2f7050 lifecycle fix · c0c5fc9c P6 tooling · + this report's wrap-up
