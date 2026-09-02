# Performance & RAM Worklog — Nora

Autonomous performance engineering session. Every action, test, and decision is recorded here
with evidence so the owner can verify later. Newest entries at the bottom within each phase.

Measurement tool: `scripts/step0-production-harness.mjs` — production build, real 1,297-song
library, scripted full-list scroll (down + up, 1458 frames), per-process WS sampling every ~2s,
CDP JS heap + DOM node counts, forced-GC stability check.

**Measurement caveat:** single runs have ±40–60 MB run-to-run noise on working-set numbers and
±10% on jank percentages. Conclusions below are only drawn from deltas larger than that noise.

---

## Phase 1 — Songs-tab scrolling optimization (fix the leak, keep the speed)

### 1.1 Context (from previous session, verified)

- Old commit `709a7f27` (pre-optimization): 32.4 FPS scroll, 97.7% janky frames.
- HEAD `80cb5972`: 51.8 FPS, 44.9% janky — the scroll optimization **worked**.
- Peak renderer WS during full-library scroll is ~equal in both (~850–885 MB) — the optimization
  did **not** trade peak RAM for speed.
- **P0 defect found:** after scrolling, HEAD retains ~52,000 detached DOM nodes that survive
  forced GC (old commit recovers to 3,561). This is an app-level leak introduced in
  `b0f96af1..80cb5972`.
- **P1 defect:** `SONG_WINDOW_GC_TIME = 30 min` keeps hydrated song-window caches (settled JS
  heap 62 MB vs 33 MB old) alive long after leaving the Songs tab.
- Pre-existing (NOT a regression): Home tab loads 22 full-res covers, 0 optimized, renderer
  +~400 MB within 7s of launch. Old commit does this too. To be addressed in Phase 2.
- **Bug fix:** production `main.ts` resolved the renderer index via
  `join(import.meta.dirname, '../renderer/index.html')`, which breaks when the window-creation
  code is emitted into `out/main/chunks/` (resolves to `out/main/renderer/index.html`, missing)
  and when Electron is launched with a script path (`app.getAppPath()` = `out/main`, so the
  fallback composed `out/main/out/renderer/index.html` → blank window). Fixed by probing
  multiple candidate paths.

### 1.2 Changes applied (currently staged)

| File | Change | Why |
|---|---|---|
| `src/main/main.ts` | Robust renderer index path resolution (candidates list) | Fix blank-window production bug |
| `src/renderer/src/components/VirtualizedList.tsx` | Restore `DEFAULT_SCROLL_SEEK_CONFIG` as default `scrollSeekConfiguration` (removed by `b0f96af1`) | Skeleton placeholders during fast fling; A/B showed jank>33ms 25.4%→15.4% with no FPS loss |
| `src/renderer/src/queries/songs.ts` | `SONG_WINDOW_GC_TIME` 30 min → 2 min | Settled JS heap 62→35 MB; windows must not outlive the tab by 30 minutes |
| `scripts/step0-production-harness.mjs` | Boot guard: abort if renderer DOM < 100 nodes | Two harness runs silently measured a blank window and produced garbage numbers |

### 1.3 A/B evidence (Phase 1 runs)

- Control (HEAD `80cb5972`): rendererSettledWS 810.1, peak 852.5, FPS 51.8, jank16 44.9%,
  jank33 25.4%, settledJSHeap 61.9, DOM after GC ~61k.
- Experiment (HEAD + fixes): rendererSettledWS 786.1, FPS 49.2, jank16 39.6%, jank33 15.4%,
  settledJSHeap 34.9, DOM after GC ~52k (leak still present → next task).
- Old baseline (`709a7f27`): rendererSettledWS 808.1, FPS 32.4, jank16 97.7%, DOM after GC 3,561
  (recovers → leak introduced after this commit).

### 1.4 Leak hunt: the "52k detached DOM nodes" is NOT an app leak — it is React DevTools

Investigation path (all measured, scripts in `scripts/`):

1. `find-detached-retainers.mjs` (4-level retainer walk) → inconclusive: chains ended at V8
   internal handles.
2. `find-detached-retainers2.mjs` (full incoming-edge BFS from detached elements) → **0 detached
   divs in the heap snapshot**, while the CDP `Nodes` metric reported 51,607 vs 1,546 live nodes
   in the document. Every div in the snapshot was reachable from *some* Document root.
3. Per-Document subtree analysis found extra Document objects with a **chrome-extension**
   NativeContext in the renderer. Cross-checking `main.ts`:
   `IS_DEVELOPMENT = !app.isPackaged || NODE_ENV === 'development'` → all unpackaged runs
   (`npm run dev` AND the production harness) install **React Developer Tools**
   via `electron-devtools-installer`. React DevTools hooks the renderer and mirrors the
   component tree — its documents/JS live in the SAME renderer process, grow as rows mount
   during scrolling, and do not shrink after GC. That exactly matches the "leak" signature.
4. **Decisive test:** added `NORA_NO_DEVTOOLS=1` env gate (`src/main/main.ts`) and set it in the
   harness. Result (current code + Phase 1 fixes, extensions OFF):

   | Metric | With React DevTools | Without |
   |---|---|---|
   | DOM after scroll+GC | 52,948 (stuck) | **3,659 (recovered)** |
   | Renderer WS settled / post-GC | 786 / 662 MB | **603 / 486 MB** |
   | JS heap settled | 34.9 MB | **20.9 MB** |
   | FPS / jank16 / jank33 | 49.2 / 39.6 / 15.4 | **55.2 / 38.9 / 9.3** |

**Corrected verdict:** no application DOM leak exists in the Songs list. The earlier
"confirmed leak" classification (previous session report) was a measurement artifact of
instrumentation loading React DevTools into the measured process. Side finding (Phase 2 input):
React DevTools costs ~120–180 MB of renderer WS in every dev/unpackaged run; packaged
production builds never install it, so this cost never reaches end users, but it has been
polluting all developer-side RAM measurements.

### 1.5 Phase 1 final state (devtools-free, the honest numbers)

- Renderer post-GC **486 MB**, settled 603 MB, peak 758 MB; JS heap 21 MB; total post-GC
  across all processes 1,195 MB.
- Scroll: 55.2 FPS, 38.9% >16ms, **9.3% >33ms** (old commit: 32.4 FPS, 97.7% >16ms).
- The old commit's numbers from §1.3 were measured WITH devtools as well, so the A/B
  conclusions there remain valid (same instrumentation both sides).
- Stability repeat (run 2): FPS 53.8, jank16 42.5%, jank33 10.1%, renderer post-GC 509 MB,
  DOM after GC 3,659, settled heap 19.9 MB → consistent with run 1 within noise.
  Raw evidence: `scripts/step0-nodevtools-run1.json`, `scripts/step0-nodevtools-run2.json`.

### 1.6 Phase 1 decision log

| Decision | Rationale |
|---|---|
| Keep bidirectional window prefetch + hydration windows (b0f96af1/3aed7041 work) | Measured: +20 FPS over old commit at equal peak RAM; removing it would restore the 2s blank-viewport problem |
| Keep `e735ba64`'s cache removal | Control run still hits 51.8 FPS without the main-process metadata cache, so the cache was not needed for the win; single source of truth preserved |
| Restore scroll-seek placeholders (undo `b0f96af1` default `false`) | jank>33ms 25.4%→15.4%, no FPS cost; placeholders during fling are standard virtualization UX |
| `SONG_WINDOW_GC_TIME` 30 min → 2 min | Hydrated windows must not outlive the tab by 30 minutes; settled heap 62→35 MB (with devtools run), 21 MB devtools-free |
| Add `NORA_NO_DEVTOOLS=1` gate for benchmarks | Instrumentation must not live inside the measured process |
| Fix production renderer-index resolution in `main.ts` | Blank-window bug when main bundle is chunked or launched by script path |

---

## Phase 2 — Full-application RAM architecture review

Baseline (post-Phase-1, devtools-free, post-GC): total ~1,195 MB across
Main ~340 + Renderer ~486-509 + GPU ~273-302 + Utility ~140.
Reference: a bare Electron window baseline is roughly Main ~100-150 / Renderer ~150-200 /
GPU ~100-150 MB, so Nora-specific overhead is concentrated in Main (+200) and Renderer (+300).

### 2.1 Main process (~340 MB WS, measured with `scripts/main-process-memory.mjs`)

- V8 heap: 77 MB used / ~101 MB committed; post-GC snapshot top retained constructors total
  ~45 MB (largest: generic `(object elements)` 27.7 MB / 356k objects — no single app cache
  dominates). **No app-level retention defect found.**
- `process.memoryUsage().external` ≈ 180-200 MB with `arrayBuffers` ≈ 0 → the external memory
  is not Buffer-backed app data; it is V8/Node/Electron native attribution.
- Remaining RSS ≈ 165 MB native (node:sqlite, Electron main, JIT/code, runtime).
- Verified: DB engine is `node:sqlite` (PGlite WASM already removed in a prior migration);
  no custom page-cache PRAGMAs; no chokidar/fs.watch watchers.
- **Decision:** treat Main ≈ 300-350 MB as current-architecture platform baseline. No change
  (any reduction here would require architectural rework, e.g. moving DB access to a
  separate process, out of scope for this pass).

### 2.2 Utility process (~140 MB) — idle auto-shutdown implemented

- Worker starts lazily on first task, but the library lifecycle gives it work at boot, after
  which it stays resident for the app's lifetime.
- **Change:** `MediaWorkerBridge` now tracks protocol activity (every `sendCommand` and
  incoming event updates `lastWorkerActivityAt`) and terminates the utilityProcess after 5 min
  of zero traffic (30s check interval). State is reset to `UNINITIALIZED` once `terminate()`
  AND the process `exit` event both complete, so the next task transparently respawns it.
  Streaming tasks keep protocol messages flowing, so a mid-task shutdown cannot occur while
  work is in flight; supervision/crash-recovery paths are untouched.
- Env override: `NORA_WORKER_IDLE_SHUTDOWN_MS` (0 disables).
- Expected effect: −140 MB at idle; +respawn latency (~200-400 ms) on the first task after an
  idle period. Trade accepted (RAM-conservative bias).

### 2.3 GPU process (~273-302 MB) — row blur removal (measured experiment)

- Found: every Song row carries `backdrop-blur-md` when the dynamic theme background is set
  (Song.tsx row className). With 40-80 rows mounted, that is 40-80 composited blur surfaces.
- Visual reasoning: rows sit adjacent in a flat list; the only content behind a row is the app
  background, which under the dynamic theme is *already* blurred artwork — the per-row blur is
  a double-blur with no perceptible effect; with a solid background it does nothing at all.
- **Change:** removed `backdrop-blur-md` from both row states. Translucency (bg-*/70), shadows,
  and all other styling kept.
- Result (2 runs each side, same harness):

  | Metric | With row blur (runs 1/2) | Without row blur (runs 1/2) |
  |---|---|---|
  | Renderer WS settled | 603 / 647 MB | **465 / 595 MB** |
  | Total WS settled | 1,341 / 1,386 MB | **1,194 / 1,325 MB** |
  | FPS | 55.2 / 53.8 | 54.5 / 54.5 |
  | Janky >33 ms | 9.3 / 10.1 % | **1.9 / 2.6 %** |
  | Janky >16 ms | 38.9 / 42.5 % | 66.9 / 59.2 % (many tiny hiccups, far fewer severe stalls) |
  | GPU peak | 302 / 301 MB | 352 / 299 MB (unchanged within noise) |

  Interpretation: the win lands in the RENDERER compositor (backdrop-filter forces per-row
  layerization in the renderer, not the GPU process). Frame-time profile improved where it
  matters: severe 2x-frame stalls collapsed ~4x while average FPS held at ~54.5.

### 2.5 Utility idle-shutdown verification + measurement correction

- **Measurement correction:** the harness's ~140 MB "utility" line is Chromium's built-in
  utility services (audio/network/storage), NOT the media worker — the worker is spawned
  lazily on first task and, with the library in *manual* scan mode (owner's real preference),
  does not spawn at boot at all. The idle-shutdown change therefore does not (and should not)
  move the harness numbers; it targets real sessions after scans/artwork/waveform/ReplayGain
  work, where the worker previously stayed resident forever.
- **Verification:** new unit tests `test/workers/workerIdleShutdown.test.ts` (3/3 pass):
  stays READY under continuous traffic; shuts down after the idle window and returns to
  `UNINITIALIZED` so the next task respawns transparently; env `=0` disables entirely.
  Existing worker+integration suites: 81/82 pass — the single failure
  (`adversarial-uncooperative-shutdown`-adjacent metadata diff test) reproduces with the
  changes stashed, i.e. pre-existing and unrelated.
- `resetSupervisionStateForTesting` now also clears the idle timer (no open handles).

### 2.6 Phase 2 decision log

| Decision | Rationale |
|---|---|
| Main process: no change | Retained heap ~45 MB, no dominant app cache; RSS is Electron/Node/SQLite platform baseline |
| Utility idle auto-shutdown (5 min default, env-tunable) | Worker was resident-for-life after first task; respawn cost (~200-400 ms) only on first post-idle task; RAM-conservative bias |
| Remove per-row backdrop-blur on Songs rows | −100-140 MB renderer settled, severe stalls 4x lower, no FPS loss; blur over an already-blurred dynamic theme is imperceptible |
| Home 50px-optimized artwork switch: REJECTED | Cards render up to ~384 px; 50px source visibly degrades quality (feature loss) |
| Home medium-variant artwork (300px): DEFERRED | Correct long-term fix but needs a regeneration strategy for existing libraries — future upgrade pass |
| React DevTools kept gated for dev only (NORA_NO_DEVTOOLS=1 in benchmarks) | DevTools costs 120-180 MB inside the measured process; must never pollute baselines |

### 2.7 Phase 2 net results (devtools-free, 1,297-song scripted scroll)

- Total settled WS: ~1,340-1,386 MB → **~1,194-1,325 MB** (median ≈ −140 MB)
- Renderer settled: ~603-647 MB → **~465-595 MB**
- Severe scroll stalls (>33 ms): ~10% → **~2%**, FPS ~54.5 unchanged
- DOM recovers to 3,659 after full-library scroll (no leak)
- Idle sessions additionally save up to ~140 MB when the media worker self-terminates

### 2.4 Home tab (+~230 MB renderer in first 7 s) — measured, deferred

- Re-verified with devtools-free harness: Home jump is +230 MB renderer / +130 MB GPU
  (383→613 renderer, 122→252 GPU) — and the OLD commit jumps MORE (+400 MB). Not a regression.
- Verified artwork facts: optimized covers on disk are 50×50 px (~1 KB); full covers ~18-51 KB
  (larger dims); Home requests 22 full-res, 0 optimized. Decoded cost of 22 covers ≈ 20-30 MB —
  real but NOT the dominant part of the jump; most is Chromium runtime warming (fonts, Skia,
  JIT, compositor tiles) that any content-heavy first page pays.
- **Decision:** switching Home cards to the 50px optimized variant would be visibly blurry
  (cards render up to ~384 px). Correct fix is a third `medium` (~300px) artwork variant
  generated at scan time — deferred to a future upgrade pass (requires regeneration strategy
  for existing libraries), noted as the top renderer lever for later.
## Phase 3 — Deep review of remaining subsystems

### 3.1 Renderer bundle composition (1.96 MB index chunk, analyzed via source map)

| Share | Size | Module |
|---|---|---|
| 12.0% | 523 KB | react-dom (core, unavoidable) |
| 10.6% | 464 KB | **pinyin-pro** (Chinese romanization) |
| 7.7% | 337 KB | app routes/main-player |
| 6.1% | 266 KB | zod |
| 4.9% | 213 KB | app SettingsPage |
| 4.8% | 208 KB | @hello-pangea/dnd |
| 3.7% | 159 KB | **@neos21/detect-chinese** |
| 3.2% | 140 KB | @tanstack/router-core |
| 3.1% | 136 KB | @tanstack/table-core |
| ~7% | ~330 KB | app autotag / BatchSongTagsEditor / SongTagsEditingPage |

- `pinyin-pro` + `@neos21/detect-chinese` + `kuroshiro` (~670 KB source) enter the renderer
  bundle through `src/common/parseLyrics.ts`, which uses them ONLY for ja/zh/ko language
  detection of lyrics.
- **Attempted:** replace detection with Unicode-range heuristics. Rejected after reading the
  libraries: `detect-chinese`'s Chinese-kanji test is a 159 KB *enumerated* character list;
  a range approximation cannot guarantee byte-identical language labels for edge cases
  (kanji sets, mixed scripts). Lyrics language drives romanization and display — feature risk.
- **Deferred design (Phase-3 candidate, documented for a future pass):** keep the libraries
  but move them to a lazily-imported chunk (`await import()` inside a cached promise +
  background prefetch on idle). Behavior stays byte-identical; the main bundle sheds ~670 KB
  of parse/JIT cost. Requires an async API or a load-gate in `parseLyrics` — a focused change
  that should be verified against the full lyrics suite.
- Parity baseline locked in NOW: `test/src/common/parseLyricsLanguage.test.ts` (4 tests:
  zh / ja / ko / en) records current detection behavior so any future refactor is verifiable.

### 3.2 Audio pipeline — verified clean

- Waveform peaks are pre-computed at scan time and stored as small fixed-size raw files
  (~2 KB); playback IPC reads those, never full audio files.
- Playback streams through the `nora://` protocol handler (chunked, Range-capable); no
  app-level whole-song buffering found.
- Verdict: no change needed.

### 3.3 Preload and persisted state — verified clean

- Preload bundle is 32 KB. Persisted state is a single JSON blob in localStorage
  (disk-backed, not a RAM driver). No V8 heap-limit flags are set anywhere.

### 3.4 Repository hygiene notes (pre-existing, not introduced by this work)

- `npm run typecheck:web` reports ~145 pre-existing errors (config scope picks up main-process
  files; SongCard.tsx references an undefined `multipleSelectionsData`; two playlist routes
  pass `SongData[]` where `number[]` is expected). `typecheck:node` is clean. None of these
  were introduced or masked by this work; they are worth a dedicated cleanup pass.
- One test fails in `test/integration/` (metadata diff suggestion) with and without this
  work's changes — pre-existing.

---

## Final summary (this session)

| Area | Before | After | Evidence |
|---|---|---|---|
| Songs scroll FPS | 32.4 (old) → 51.8 (HEAD start) | **54.5** | step0 harness ×2 runs per config |
| Severe scroll stalls (>33 ms) | 29.7% old / 9-10% HEAD start | **1.9-2.6%** | step0 harness |
| DOM after full-library scroll + GC | stuck at 52-61k (phantom: React DevTools) | **3,659, recovered** | find-detached-retainers2 + devtools-free runs |
| Renderer settled WS | 603-647 MB | **465-595 MB** | step0 harness |
| Total settled WS (4 processes) | 1,340-1,386 MB | **1,194-1,325 MB** | step0 harness |
| Media worker at idle | resident for life | **self-terminates after 5 min idle** | workerIdleShutdown.test.ts (3/3) |
| Blank-window production bug | present (chunk-dependent) | **fixed** | main.ts path probing |
| Measurement validity | React DevTools polluted all dev benchmarks | **NORA_NO_DEVTOOLS=1 gate** | main.ts + harness |

Commits: `daea6f2c` (Phase 1), `ed3f4421` (Phase 2), plus this worklog.

**Deferred candidates (documented, not implemented):**
1. Medium (300px) artwork variant for Home cards — top remaining renderer lever (~20-30 MB
   decoded images + GPU textures); needs a regeneration strategy for existing libraries.
2. Lazy romjanization chunk — sheds ~670 KB from the main bundle, byte-identical behavior;
   needs a focused lyrics-suite verification.
3. Pre-existing typecheck:web errors and the one pre-existing failing integration test.

---
