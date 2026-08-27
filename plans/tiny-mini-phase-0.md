# Tiny Mini — Phase 0 Implementation Plan (Instrumentation & Architecture Audit)

> **Architectural rule (binding for all phases):**
> Tiny Mini is an experimental presentation surface. It must not introduce a second source of truth
> for playback, queue, persistence, or library state. It must not modify the existing Standard/Compact
> MiniPlayer implementation except where necessary to expose the experiment.
>
> **Phase 0 makes zero production behavior changes.** Its output is documentation, an exact baseline,
> and one time-boxed build spike behind a dev-only flag.
>
> **Decision gate:** Phase 0 does NOT flow into implementation automatically. When Phase 0 completes,
> the measured numbers are reviewed and an explicit go/no-go decision is made:
> *"Tiny gives us enough isolation to justify the complexity"* — proceed to Phase 1 planning,
> or *"the renderer floor is too high / complexity isn't worth it"* — discard the experiment.

---

## 1. Objective

Answer, with repository evidence, the questions that must be settled **before** any Tiny code is written:

1. What exactly does the renderer load today in Standard/Compact Mini mode, and what can a Tiny entry skip?
2. Who owns playback/queue/persistence state, and what is the minimal contract Tiny must honor?
3. Which IPC channels does Tiny actually need, and are there gaps?
4. Can the build produce an isolated Tiny runtime at all (multi-entry or split bootstrap) — **proven by the actual loaded resource graph, not by chunk boundaries**?
5. What is the exact Phase-1 baseline against which Tiny will be judged?

## 2. Current Behavior (verified from repository)

### 2.1 Build / entry configuration

- [`electron.vite.config.ts`](../electron.vite.config.ts:30) defines a **single renderer entry**:
  `src/renderer/index.html` → [`src/index.tsx`](../src/renderer/src/index.tsx:1).
- The renderer entry unconditionally mounts the full application:
  `QueryClientProvider` + `ReactQueryDevtools` + `CollectionEventProvider` + `UndoShortcutProvider`
  + TanStack Router ([index.tsx](../src/renderer/src/index.tsx:68)).
- Global CSS (`styles.css`), Material Symbols icon font CSS, and i18n are imported at the entry,
  so they load in every mode including mini.

### 2.2 Window & mode model

- One `BrowserWindow` for everything. [`main.ts`](../src/main/main.ts:108) holds
  `playerType: 'normal' | 'mini' | 'full'`; [`changePlayerType()`](../src/main/main.ts:1239)
  resizes/repositions the **same window** and never reloads the renderer document.
- The renderer decides what to render from its own store:
  [`App.tsx`](../src/renderer/src/App.tsx:424) branches `playerType === 'mini'` → `<MiniPlayer />`,
  `'full'` → `<FullScreenPlayer />`, else `<Outlet />`.
- **Crucially, the entire provider/router/query tree stays mounted in mini mode.** Only the view swaps.
- DB already persists `miniPlayerMode: 'standard' | 'compact'`
  ([schema.ts](../src/main/db/schema.ts:586)) plus mini position/size/always-on-top settings.
  Adding `'tiny'` to this union matches the intended semantics exactly
  (`playerType` stays `'mini'`; `miniPlayerMode` gains `'tiny'`).

### 2.3 Playback & state ownership — **correction to the experiment brief**

The brief assumed authoritative playback state lives in Main/DB. **It does not.** Verified:

- [`AudioPlayer`](../src/renderer/src/other/player.ts:44) lives **in the renderer**: it owns the
  `HTMLAudioElement`, a WebAudio `AudioContext` with equalizer `BiquadFilterNode`s and a `GainNode`,
  and reacts to queue position changes to load songs.
- [`QueuesManager`](../src/renderer/src/other/queuesManager.ts:56) restores/persists queue state via
  **renderer localStorage**, not the main-process DB.
- UI state (`currentSongData`, `playerType`, etc.) lives in the renderer TanStack store
  ([appReducer.tsx](../src/renderer/src/other/appReducer.tsx:7)).
- Main process owns: window lifecycle, settings DB, Last.fm scrobble flushing, Discord RPC relay,
  media-key/taskbar events (which it forwards *to* the renderer over IPC).

**Consequence:** "Tiny must not own playback" cannot mean "playback stays in main". It means:
**Tiny must reuse the same renderer-side modules** — `player.ts`, `queuesManager.ts`,
`positionScheduler.ts`, `localStorage` utils — as the only playback engine. Redesigning playback
ownership remains out of scope per the brief (§5), and if Tiny turns out to require it, that is a
documented finding, not an implementation task.

### 2.4 Position update cadence — already solved

[`PositionTimerScheduler`](../src/renderer/src/other/positionScheduler.ts:5) already implements
exactly the policy the brief asks for:

| State             | Cadence |
|-------------------|---------|
| `PLAYING_VISIBLE` | 100 ms  |
| `PLAYING_HIDDEN`  | 1000 ms |
| `PAUSED`          | stopped |
| `IDLE_NO_SONG`    | stopped |

Tiny reuses this module unchanged; no new cadence logic should be written.

### 2.5 Artwork

MiniPlayer containers already prefer `artworkPaths.optimizedArtworkPath` with fallback to
`artworkPath` then `DefaultSongCover` (e.g. [QueueContainer.tsx](../src/renderer/src/components/MiniPlayer/containers/QueueContainer.tsx:98)).
Tiny adopts the identical chain; nothing new to design, only to verify resolution of optimized paths
in a fresh document (file protocol handling in [`handleFileProtocol.ts`](../src/main/handleFileProtocol.ts)).

### 2.6 Existing instrumentation

- [`scripts/benchmark-all-modes.mjs`](../scripts/benchmark-all-modes.mjs:178): CDP-driven runner that
  launches the app with `--remoteDebuggingPort 9876`, drives Main → Standard → Compact modes, and
  writes `memory_report_modes_comparison.json`.
- Additional diagnostics: `investigate-renderer-memory.mjs`, `diagnose-memory-breakdown.mjs`,
  `diagnose-listeners-and-dom.mjs`, `run-memory-experiment.mjs`.
- Prior baselines archived as `memory_report_run_*.json` at repo root.

## 3. Problem / Root Cause

Post-Phase-1, Standard vs Compact Mini differ by only ~10–20 MB renderer WS because **both run the
identical full renderer runtime** (router, query ecosystem, all providers, i18n, icon font). The open
question is whether the *renderer architecture itself* is the dominant remaining cost. Tiny isolates
that single variable. Phase 0 exists to make sure the experiment is measurable and doesn't silently
violate its own isolation rules.

## 4. Hard Requirements (established before the spike)

These are non-negotiable acceptance criteria for ANY architecture option:

### R1 — Audio continuity across mode transitions

```text
Normal → Tiny and Tiny → Normal must preserve:
  - no audio interruption
  - no queue reset
  - no position jump
  - no volume reset
  - no duplicate AudioPlayer instance
  - no duplicate QueuesManager instance
```

If Option A interrupts audio, **Option A is rejected immediately**, regardless of memory savings.
There is no value in saving memory if changing Mini mode stops/restarts the song.

### R2 — No duplicate playback/queue state

Exactly one `AudioPlayer`, one `QueuesManager`, one store. Shared-state target architecture:

```text
                 Shared Renderer State
                         │
          ┌──────────────┼──────────────┐
          │              │              │
      AudioPlayer   QueuesManager   Store
          │              │              │
          └──────────────┼──────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     Standard         Compact           Tiny
      Mini UI          Mini UI          Mini UI
```

Never:

```text
Standard → its own playback state
Compact  → its own playback state
Tiny     → its own playback state
```

That would recreate the synchronization problems already fixed.

### R3 — Configuration vs runtime state separation

Tiny **configuration** reuses existing shared Mini settings (all fine to read/write):

```text
miniPlayerMode = 'tiny'
miniPlayerPinnedControls
isMiniPlayerAlwaysOnTop
miniPlayerX/Y/Width/Height
```

Tiny must **never create** parallel runtime state:

```text
tinyQueue ✗   tinyCurrentSong ✗   tinyVolume ✗
tinyPosition ✗   tinyPlayerState ✗
```

### R4 — Isolation proven by loaded resources, not chunk names

"Vite generated separate chunks" is **not** acceptable proof. The spike must demonstrate the actual
loaded resource graph at Tiny boot:

```text
Tiny boot loads ONLY:
  ├── Tiny code
  ├── playback core (player, queue, position scheduler)
  ├── required IPC/preload surface
  └── required styles

Tiny boot must NOT load:
  ├── Router / routeTree
  ├── Home / Library / Search / Artists / Albums pages
  ├── Collection providers
  ├── React Query ecosystem (unless Tiny demonstrably needs it)
  └── full-app i18n / icon-font infrastructure
```

## 5. Candidate Architectures (no prejudgment — decided by spike data)

### Option A — Separate HTML entry

```text
mainWindow.loadFile('tiny.html')   ← new document, new AudioContext, playback interrupts
```

- ✅ Strongest bundle/runtime isolation; cleanest measurement.
- ❌ Unloading the document destroys the renderer-owned `AudioPlayer`/`AudioContext` → playback
  interruption on every Normal↔Tiny transition. Given R1, **expected verdict: reject**, unless the
  spike surfaces a mechanism that preserves the renderer-owned audio context without redesigning
  playback ownership (out of scope).
- Requires multi-page config in electron-vite renderer `rollupOptions.input`.

### Option B — Split bootstrap inside the same document

```text
index.tsx becomes a thin loader:
  read boot mode (from preload/main)
  dynamic import('./fullApp')  → providers + router + query tree
  dynamic import('./tinyApp')  → TinyPlayer + shared playback modules only
```

- ✅ Same document → no audio interruption, no window reload, transitions are cheap chunk swaps.
- ⚠️ **Not assumed to work.** If `index.tsx` (or anything it statically imports) transitively pulls
  the full application graph before the dynamic import executes, isolation is illusory. The spike
  must verify R4 against the real loaded resource graph before B can be recommended.
- ⚠️ If the shared-dependency floor turns out to be most of the footprint, B degenerates into
  "same renderer + dynamic imports + complexity ≈ same memory" — that outcome must be detected and
  reported honestly.

Phase 0 deliverable: a one-page comparison with measured numbers (loaded resource graphs, boot heap,
transition latency, audio continuity) and a recommendation — or a recommendation to discard.

## 6. Tiny Experiment Success Criteria (defined NOW, before building)

Recorded now so the post-Phase-0 decision is mechanical, not vibes-based.

### Memory (renderer WS, playing state, 60 s soak)

```text
Reference band (from baseline):
  Standard Mini   ≈ 290–300 MB
  Compact Mini    ≈ 280–290 MB

Tiny outcomes:
  ≥ 280 MB        → FAILURE: architecture accomplished nothing; discard experiment
  ~250 MB         → WEAK: interesting but likely not worth the complexity; decide explicitly
  120–180 MB      → STRONG: dedicated architecture clearly worthwhile; proceed to Phase 1 planning
```

GPU WS and V8 heap are recorded alongside with the same relative logic (Tiny materially below the
~140 MB GPU / ~31 MB V8 reference band = supporting evidence).

### CPU (per scenario)

Measured for every mode: idle · playing · paused · queue open · lyrics open (existing modes only;
lyrics is not a Tiny v1 feature — Tiny's row documents "n/a").

### Transitions (hard requirements from R1)

Both directions timed and asserted: no audio interruption, no queue reset, no position jump,
no volume reset, single player/queue instances throughout.

### Interpretation rule

If Tiny's renderer footprint ≈ existing Mini renderers, the conclusion is that something outside the
application tree dominates the renderer floor — investigate *that* before continuing any Tiny work.

## 7. Proposed Design (for Phase 0 only)

Phase 0 produces five artifacts:

| # | Artifact | Output location |
|---|----------|-----------------|
| P0-1 | Exact re-run baseline (Normal / Standard / Compact) | `memory_report_p0_*.json` + summary table in `architecture/tiny-mini/PHASE_0_FINDINGS.md` |
| P0-2 | State-ownership & reuse audit (modules Tiny must import vs must not) | `architecture/tiny-mini/STATE_OWNERSHIP.md` |
| P0-3 | IPC contract inventory (exact channel list Tiny needs; gap analysis) | `architecture/tiny-mini/TINY_IPC_CONTRACT.md` |
| P0-4 | Build spike: Option A vs Option B feasibility measurements incl. loaded resource graphs | spike branch notes in `PHASE_0_FINDINGS.md` |
| P0-5 | Transition & failure-mode design notes (crash recovery, mode persistence) | `PHASE_0_FINDINGS.md` |

All under `architecture/tiny-mini/`, consistent with the existing `architecture/` docs layout.

## 8. Implementation Steps

### Step 1 — Re-establish the exact baseline (P0-1)

Files/modules: none changed; runs of [`benchmark-all-modes.mjs`](../scripts/benchmark-all-modes.mjs),
[`diagnose-listeners-and-dom.mjs`](../scripts/diagnose-listeners-and-dom.mjs).

Reason: the quoted baseline (~1003 MB total / ~297 MB renderer / ~146 MB GPU / ~31 MB V8 / ~571
listeners) must be reproduced on the current commit with the same methodology that will later measure
Tiny, otherwise comparison is invalid.

Procedure:
- Record commit hash, OS, Electron version, power state.
- Run scenario A (Normal playing 60 s), B (Standard Mini), C (Compact Mini); ≥3 runs each.
- Capture: Total/Main/Renderer/GPU WS, V8 heap, CPU, listener count, DOM node count, IPC rate.
- Extend `benchmark-all-modes.mjs` **only additively** with a `--modes` flag so the same script can
  later run scenario D (Tiny) without changing existing scenarios.

### Step 2 — State-ownership & reuse audit (P0-2)

Files/modules documented: [`other/player.ts`](../src/renderer/src/other/player.ts),
[`other/queuesManager.ts`](../src/renderer/src/other/queuesManager.ts),
[`other/playerQueue.ts`](../src/renderer/src/other/playerQueue.ts),
[`other/positionScheduler.ts`](../src/renderer/src/other/positionScheduler.ts),
[`utils/localStorage.ts`](../src/renderer/src/utils/localStorage.ts),
[`store/store.ts`](../src/renderer/src/store/store.ts),
[`other/appReducer.tsx`](../src/renderer/src/other/appReducer.tsx).

Reason: define the exact **allow-list** of modules a Tiny entry may import, so review of Phase 1 PRs
is mechanical. Anything outside the allow-list (router, queries/, most hooks, contexts/) is forbidden.

Deliverable content:
- Allow-list (playback core, position scheduler, storage utils, artwork resolver, window-controls
  adapter, minimal settings reader).
- Deny-list with reasons (queryClient, routeTree, i18n — evaluate whether Tiny v1 ships English-only
  strings to avoid pulling i18n; document decision).
- Explicit statement that queue/playback authority remains where it is today (renderer modules +
  localStorage); Tiny adds **no new persisted state** beyond reading/writing the existing shared Mini
  settings (`miniPlayerMode`, pinned controls, always-on-top, window geometry). Tiny-specific
  runtime state (`tinyQueue`, `tinyVolume`, `tinyPosition`, …) is forbidden (R3).
- Trace the transitive import graph of the existing MiniPlayer components so the allow-list reflects
  reality, not intent.

### Step 3 — IPC contract inventory (P0-3)

Files/modules documented: [`src/preload/index.ts`](../src/preload/index.ts:814) api groups and the
matching `ipcMain` handlers in [`src/main/ipc.ts`](../src/main/ipc.ts) / [`main.ts`](../src/main/main.ts).

Reason: the brief requires reusing existing channels. Verify channel-by-channel which ones Tiny needs:

| Tiny need | Existing API (verified) | New channel? |
|---|---|---|
| Play/pause, next, prev (media keys/taskbar → renderer) | `playerControls.toggleSongPlayback / skipForwardToNextSong / skipBackwardToPreviousSong` | No |
| Renderer → main playback state (taskbar, tray) | `playerControls.songPlaybackStateChange` | No |
| Position reporting | `playerControls.sendSongPosition` | No |
| Favorite | `playerControls.toggleLikeSongs` | No |
| Always-on-top | `miniPlayer.toggleMiniPlayerAlwaysOnTop` | No |
| Mode switch | `windowControls.changePlayerType` (+ proposed `setMiniPlayerMode('tiny')`) | Reuse `miniPlayer.setMiniPlayerMode`; extend union only |
| Settings read (mode, pinned controls) | `settings.getUserSettings` | No |
| Song data at boot | `audioLibraryControls.checkForStartUpSongs` / `getSong` + localStorage queue restore | No |
| Data-update events (song edited externally) | `dataUpdates` group | No |

Gap analysis tasks: confirm how `currentSongData` reaches the store on song change in mini today
(AudioPlayer events vs IPC) and record it; confirm Discord RPC and Last.fm now-playing flows are
triggered renderer-side and enumerate which calls Tiny must keep sending to avoid degrading those
features (or accept degradation and document it as experiment scope).

### Step 4 — Build spike: Option A vs Option B (P0-4)

Files/modules (spike branch only, not merged):
- Option A: `electron.vite.config.ts` renderer `rollupOptions.input` with a second html; throwaway
  `tiny.html` rendering static text.
- Option B: refactor `index.tsx` into loader + two dynamically-imported roots on a spike branch.

Measurements to capture per option:

**Loaded JS resource graph (R4 — mandatory, this is the primary evidence):**
- Number of JS resources loaded at Tiny boot.
- Total JS transferred / parsed / executed bytes (CDP `Performance.getMetrics` +
  `Network.responseReceived` aggregation, or `PerformanceObserver` 'resource' entries).
- Named list of loaded chunks cross-checked against the deny-list: Router, routeTree, Home, Library,
  Search, Artists, Albums, collection providers, query ecosystem, i18n, icon font CSS.
- A shared "common" chunk loading under Tiny counts as loaded weight — report it explicitly rather
  than hiding it inside "chunk sizes".

**Runtime behavior:**
- Cold boot heap of Tiny runtime.
- Transition latency both directions (Option A: `loadFile` swap; Option B: chunk swap).
- Audio continuity across transition (expected: A = interrupt → fails R1; B = continuous → verify,
  don't assume).
- Singleton/module identity proof during transition: verify **actual module identity**, not merely the
  `window.__NORA_AUDIO_PLAYER__` diagnostic (which could itself be incorrectly implemented). Concretely:
  both roots must resolve the same module instances — import the player/queue/store modules from each
  root's chunk and assert referential equality (`playerA === playerB`), plus exactly one live
  `HTMLAudioElement` and one `AudioContext` in the document at all times.

Reason: this is the single highest-leverage unknown; deciding A vs B on data prevents building
Phase 1 on the wrong foundation — and may correctly conclude "neither is good enough".

### Step 5 — Failure-mode & transition design notes (P0-5)

Content:
- Crash recovery: main already handles renderer crashes generically; document what
  `render-process-gone` currently does and what Tiny needs (reload last presentation mode; playback
  state loss on crash is accepted and documented — invariant: **a Tiny crash must not corrupt
  persisted queue/settings state, and the existing restore path must recover correctly after renderer
  recovery**). This is verified empirically in the spike (kill the renderer mid-playback, confirm
  queue/settings restore), not assumed from how browser storage normally behaves.
- Mode persistence: `miniPlayerMode: 'tiny'` round-trip through `saveUserSettings`/`getUserSettings`;
  startup honors persisted mode without flashing the full app (boot-order note for whichever option wins).
- Expansion behavior acceptance: Normal→Tiny and Tiny→Normal latency is measured, not optimized.

## 9. Ownership & Invariants

Invariants established in Phase 0 and enforced in review thereafter:

1. `playerType` remains `'normal' | 'mini' | 'full'`; Tiny is `miniPlayerMode: 'tiny'`. No new player type.
2. Single playback engine: renderer-side `AudioPlayer` + `QueuesManager`. Tiny imports them; never forks them.
3. Exactly one instance of each playback/queue singleton across any transition (R2).
4. Tiny configuration = existing shared Mini settings; Tiny creates zero new persisted state and zero
   tiny-prefixed runtime state (R3).
5. No new IPC channels in Phase 1 unless P0-3 documents a proven gap.
6. No changes to `StandardMiniPlayer`/`CompactMiniPlayer` components or their styles.
7. Position cadence comes exclusively from `PositionTimerScheduler`.
8. Audio continuity across Normal↔Tiny transitions is a hard requirement (R1); any architecture that
   cannot meet it is rejected.

## 10. Testing Strategy

Phase 0 is measurement/documentation, but the benchmark script change (Step 1) needs:

- Unit: none required for additive `--modes` flag beyond a smoke run asserting existing default behavior is unchanged (script still runs all three scenarios when flag omitted).
- Regression: run `benchmark-all-modes.mjs` end-to-end once after modification and diff report shape against prior `memory_report_modes_comparison.json`.
- Spike verification:
  - Assert via CDP network data that the Tiny boot resource set contains none of the deny-list
    entries (Router/routeTree/pages/providers/query/i18n/icon font) — resource-graph assertion, not
    chunk-name assertion.
  - Assert audio element continuity across a mode transition (Option B), proving singleton identity
    via actual module referential equality (player/queue/store imported from both roots compare
    identical) and a single live `HTMLAudioElement`/`AudioContext` — not via the
    `window.__NORA_AUDIO_PLAYER__` diagnostic alone.
  - Assert and record the playback interruption (Option A) as evidence for the R1 rejection.

## 11. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Document-swap kills playback (Option A) | Violates hard requirement R1 | Expected rejection; measured in Step 4 as formal evidence |
| Entry chunk transitively pulls full app graph (Option B) | Isolation is illusory; experiment measures nothing | R4 resource-graph verification is mandatory before B is recommended |
| Shared-dependency floor dominates footprint | B degenerates into complexity without savings | Report shared-chunk weight explicitly; feeds the go/no-go decision honestly |
| Baseline drift (hardware/background load) | Invalid comparison later | ≥3 runs, recorded environment, same script/methodology |
| Spike leaks into production | Violates "no behavior changes" | Spike on separate branch; merge only docs |
| Hidden coupling (hooks reaching into query infra) discovered late | Tiny allow-list unrealistic | Step 2 audit traces actual imports of MiniPlayer components before allow-list is finalized |
| i18n/icon-font/CSS pulled in transitively | Silently recreates the footprint being measured | Step 4 resource-graph check makes this visible immediately |
| Momentum bias ("it works, let's build it") | Experiment becomes a refactor anyway | Explicit go/no-go gate after Phase 0 using §6 success criteria |

## 12. Verification

Phase 0 is complete when:

- [ ] `memory_report_p0_*.json` baselines exist for scenarios A/B/C with environment metadata.
- [ ] `architecture/tiny-mini/STATE_OWNERSHIP.md` lists a concrete import allow/deny list traced from real imports.
- [ ] `architecture/tiny-mini/TINY_IPC_CONTRACT.md` shows zero-required-new-channels (or lists proven gaps).
- [ ] Loaded JS resource graph captured for each option: resource count, transferred/parsed/executed JS, deny-list cross-check.
- [ ] Option A vs Option B recommendation backed by measured resource graphs, boot heap, transition latency, and audio-continuity results.
- [ ] §6 success criteria table pre-filled with baseline numbers so the future Tiny column is a drop-in comparison.
- [ ] `git diff main` for Phase 0 touches only: benchmark script (additive flag), new files under `architecture/tiny-mini/`, and this plan.

## 13. Open Questions (carried to Phase 1 planning, answered by Phase 0 artifacts)

1. Option A vs Option B — decided by Step 4 data against hard requirement R1 and the R4 resource graph.
2. Does Tiny v1 ship English-only strings (avoiding i18n) or a minimal i18n subset?
3. Which renderer→main notifications (Discord RPC, Last.fm now-playing) must Tiny keep emitting for the experiment to be feature-honest versus allowed to degrade?
4. Does `checkForStartUpSongs` suffice for Tiny cold-boot song restoration, or is a queue-restore read needed first?
5. Does Tiny actually need any React Query infrastructure, or can its settings reads be plain IPC calls?

---

**Next step after approval:** implement Phase 0 Steps 1–5 (measurement + docs + spike). The output is
a **go/no-go decision memo** against the §6 success criteria. Phase 1 (minimal Tiny renderer) is
planned only if — and after — that decision is reviewed and approved.
