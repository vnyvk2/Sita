# SESSION HANDOFF — B-Fix (Windowed Hydration) Status

Worktree: `C:\Users\VINAY\.gemini\antigravity\worktrees\Nora\mem_profile_instrumentation` (branch `mem_profile_instrumentation`, off master@870d45a8)
Design doc: `architecture/b-data-layer-windowed-hydration-design.md`
Measurement report (pre-B): `%TEMP%\opencode\nora-memprof\REPORT.md`

## COMMITTED (P1–P5 + fixes)

| Commit | Content |
|---|---|
| 870d45a8 | memProfiler + measurement matrix tooling (env-gated) |
| 37b47bc4 | P1: data endpoints (getFilteredSongLibraryIds, facets, albumSummaries, durations) + IPC/preload |
| 8662f72e | P2: Songs page ID-first windowed hydration (useWindowHydration, SongRowSkeleton, loader prewarm) |
| cf5e47ab | P3: surgical invalidation (eventData ids → exact window keys) + repaired test drift (13/13 green) |
| 642d8d86 | P4: Albums summaries grid (no embedded songs, infinite pages, lazy getAlbumSongIds) |
| 995dd873 | P5: Queue page windows + durations endpoint (namespaced cache keys) |
| 2d2f7050 | fix: boot-restore validates currentSong.songId type (SONG_ID_UNDEFINED dialog) |

UNCOMMITTED at handoff: main.ts (NORA_NO_SCAN gate), ipc.ts (scheduler/recovery gates), songs.ts (NORA_DEBUG_IDS-gated logging), memProfiler.ts (queue step + like-probe + golden-master), scripts (generate-synthetic-library.mjs, count-songs.mjs, debug-*.mjs), run-matrix.ps1 (custom variant + param fixes). COMMIT THESE FIRST — they are the P6 tooling.

## MEASURED RESULTS (all @ i5-10210U/8GB, isolated profiles)

### Songs payload scaling (the B cliff, confirmed + fixed)
| Library | OLD getAllSongs | NEW (ids + windows) |
|---|---|---|
| 1,297 | 1,293.8 KB / 587–1,698 ms | ~199 KB window + ~10 KB ids (page cache 311 KB) |
| 51,297 | **51.3 MB / 11,537–33,244 ms** | **same ~199 KB window; page cache 568 KB; heap flat 14.5 MB** |

### Albums @1.3k lib
Embedded-songs payload 823 KB → 435 KB total step cache (summaries 62 KB/page ×2).

### Golden-master (parity, 32 combos @1.3k)
Membership parity: 100% (zero length mismatches). Order diffs only at sort-tie positions (duplicate titles); ids query now has deterministic `asc(songs.id)` tiebreak; legacy path had unstable ties. onlyFavoriteArtists combo not renderer-testable (old client needed separate favorite-artist set) — SQL logic mirrors favAlbums pattern, verify in next session if desired.

### C-problem evidence (measured, was previously unproven)
- Boot scan discovering 50k missing files → **180–390 s ready-to-show stall** (main-process starvation)
- JobScheduler waveform/replaygain jobs on 50k missing files → 85,890 log lines (50k ENOENT ×2) → same starvation
- Both now gated via `NORA_NO_SCAN=1` (profiling only); C-fix (workers) still pending, now justified by data

### PGlite startup @51k DB
PGlite.create: 2.8 s (1.3k) → 24–28 s (51k churned) → fast after VACUUM (generator ends with VACUUM ANALYZE). First-open-after-copy is slow (OS cache); subsequent ~4 s. Feeds the better-sqlite3 reassessment.

### Known measurement-harness artifact (NOT an app bug)
p1 probe's direct `getFilteredSongLibraryIds` call via executeJavaScript returns 0 ids at 51k, while (a) main handler logs count=51297 with correct SQL, (b) the page's identical call hydrates 51k ids (cache-proven). Suspect executeJavaScript/contextBridge interplay with large returns in probe context. Next session: chase if desired (return ids.length from main instead, or probe via smaller slice).

## ENV FLAGS (all default-off, zero behavior change)
- `NORA_PROFILE_DIR=<dir>` — enables memProfiler (JSONL telemetry + scenario + auto-quit)
- `NORA_USER_DATA=<dir>` — isolated profile (independent single-instance lock)
- `NORA_NO_PGLITE=1` / `NORA_PGLITE_MEMORY=1` — DB stubs for attribution ladder
- `NORA_NO_SCAN=1` — skips library scan + JobScheduler + policy engine + recovery (profiling)
- `NORA_SCENARIO=0` — disable scenario driver
- `NORA_GOLDEN=1` — run golden-master parity suite in scenario
- `NORA_DEBUG_IDS=1` — log ids-query SQL + result counts
- `NORA_DEVTOOLS_CLOSED=1`, `NODE_ENV=production` — prod-like launches

## REMAINING (P6 tail → next session)
1. Commit uncommitted P6 tooling (first action).
2. Optional: fix probe artifact; re-run L4 golden-master on synthetic lib (has languages/genres → full sub-filter parity coverage incl. onlyFavoriteArtists decision).
3. Loader/component ids-params duplication FIXED (language:'all' defaults aligned) — verify single ids cache entry on Songs open (was 2×299.6 KB).
4. Write final REPORT-B.md from harvested numbers (most numbers already in this doc).
5. Reassess PGlite→better-sqlite3 with: 51k PGlite.create cost + startup tax vs B-fix now landing.
6. C-fix decision: scan/job worker infrastructure — now data-justified.
7. Feature flag `isWindowedLibrary` was NOT implemented — pages are converted directly; rollback = git revert of P2/P4/P5 commits (clean, isolated).
8. User's real profile contains legacy-format localStorage (string songId "zkCZSKzgHf") — guard shipped; optionally reset that playback key in source profile.

## RUN COMMANDS
```
npm run build
$env:NORA_NO_SCAN='1'  # for synthetic/50k runs
powershell -ExecutionPolicy Bypass -File scripts\mem-profile\run-matrix.ps1 -Variants "L3"
powershell -ExecutionPolicy Bypass -File scripts\mem-profile\run-matrix.ps1 -Variants "L4" -CustomVariantName L4 -CustomProfileDir "$env:TEMP\opencode\nora-memprof\synthetic50k-profile" -TimeoutSec 420
node scripts\mem-profile\generate-synthetic-library.mjs --profile=<dir> --count=50000
node scripts\mem-profile\count-songs.mjs <dir>
```
Raw telemetry: `%TEMP%\opencode\nora-memprof\<timestamp>\<variant>\{telemetry,external-samples.json}`
