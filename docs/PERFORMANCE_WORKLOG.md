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

(pending — starts after Phase 1 is committed)
