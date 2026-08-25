# Tiny Mini — Phase 1B Implementation Plan (Minimal Tiny Runtime + 4-Mode Benchmark)

> **Architectural rule (unchanged, binding):**
> Tiny Mini is an experimental presentation surface. It must not introduce a second source of truth
> for playback, queue, persistence, or library state. It must not modify the existing Standard/Compact
> MiniPlayer implementation except where necessary to expose the experiment.
>
> **Decision gate:** Phase 1B ends with a GO/NO-GO memo against the pre-committed §6 bands
> (plan/tiny-mini-phase-0.md). Isolation (Phase 0) proved Tiny *can* be isolated; Phase 1B alone
> answers whether Tiny is *worth having*. No commitment past the benchmark.

---

## 1. Objective

Implement the minimal Tiny runtime on **Option B** (split bootstrap, same document), add it to the
existing benchmark methodology as scenario D, and produce the measured verdict:

| Gate | Pre-committed criterion (renderer WS, playing) |
|---|---|
| Failure | ≥ 280 MB → discard experiment |
| Weak | ~250 MB → explicit review |
| Strong | 120–180 MB → proceed to real-mode planning |

Between bands: judge on measured resource/runtime cost. Bands do not move.

## 2. Current Behavior (verified this session)

### 2.1 Boot & mode model
- Single renderer entry: [`index.tsx`](../src/renderer/src/index.tsx) statically mounts the full app
  (`QueryClientProvider`, router, i18n, icon font, all providers).
- Cold boot **always** boots the full renderer as `playerType = 'normal'`. Mini/Compact are entered at
  runtime via store dispatch + `changePlayerType` IPC; no reload ever occurs ([App.tsx:235](../src/renderer/src/App.tsx#L235)
  `updatePlayerType`). Crash recovery re-asserts presentation over the existing message channel
  (Phase 1A).
- `miniPlayerMode` ('standard' | 'compact') is persisted in SQLite
  ([schema.ts:586](../src/main/db/schema.ts#L586)), read by main for geometry
  (`currentMiniPlayerMode`), read by the renderer inside `MiniPlayer.tsx` via the settings query,
  and switched via `app/setMiniPlayerMode` ([main.ts:1127](../src/main/main.ts#L1127),
  [preload:575](../src/preload/index.ts#L575)).

### 2.2 Playback core import graph (traced)
All clean of query/i18n/router infrastructure **except one link**:
```
player.ts ─┐
queuesManager.ts ─┤→ store/store.ts → appReducer.tsx → @renderer/i18n   ← THE CONTAMINATION LINK
positionScheduler.ts ┘        │              (imports all 5 locale JSONs ≈ 310 KB raw,
localStorage.ts ──────────────┘              i18next + react-i18next, top-level await settings)
listeningDataSession.ts, toggleSongIsFavorite.ts → clean
```

### 2.3 Full-app boot obligations (App.tsx inventory — what keeps playback/features alive)
| Obligation | Implemented in | Clean for Tiny? |
|---|---|---|
| Queue restore/init | `initializeQueuesManager()` | ✅ |
| Player singleton + position scheduler | `useAudioPlayer()` | ✅ |
| Startup song restore (`checkForStartUpSongs`) | `useAppLifecycle` | ✅ (DI hook, clean imports) |
| Media keys / taskbar skip events (main → renderer) | `useAppLifecycle` subscriptions | ✅ |
| Playback state → main (taskbar/tray) | `useAppLifecycle` play/pause listeners | ✅ |
| Listening history + Last.fm now-playing/scrobble | `useListeningData` + `songLoaded` listener | ✅ |
| Volume/repeat/mute/favorite/EQ restore | `usePlaybackSettings` | ⚠️ pulls `useUserPreferences` → queryClient (only for EQ-preset save) |
| Discord RPC | `useDiscordRpc` | ⚠️ `useTranslation` for 4 fallback labels only |
| OS media session metadata | `useMediaSession` | ⚠️ `useTranslation` for 3 fallback labels only |
| Play/pause/skip logic | `usePlayerControl` / `usePlayerNavigation` | nav ✅ · control ❌ (i18n error prompts) |

### 2.4 Existing Mini components
Confirmed not reusable for Tiny (React Query + i18n + `AppUpdateContext` hard dependencies). Tiny v1
ships its own minimal component set (also what makes the measurement meaningful).

## 3. Root Cause of Remaining Risk

Phase 0's spike stub was dependency-free by construction. The **real** Tiny runtime must import the
playback core, and §2.2 shows that path transitively drags i18n (~310 KB locales + runtime +
top-level-await module init). Unaddressed, Tiny's floor silently includes full-app-scale weight and
the experiment measures nothing. Two smaller couplings (EQ preset save, i18n labels in two hooks)
would pull the query ecosystem and i18n back in through hooks Tiny legitimately needs.

## 4. Proposed Design

### 4.1 Runtime architecture (Option B, refined into a presentation host)

```text
index.tsx  (thin loader — replaces current entry body)
    │
    ├── static: import('./boot/presentationHost')
    └── default flow: presentationHost.mountFull()
            └── dynamic import('./boot/fullBoot')     ← today's index.tsx contents verbatim

presentationHost (new, dependency-light module singleton)
    mountFull()          → createRoot(#root).render(<FullApp/>)
    enterTinyRuntime()   → fullRoot.unmount() → dynamic import('./boot/tinyBoot') → mount tiny tree
    exitTinyRuntime()    → tinyRoot.unmount()  → dynamic import('./boot/fullBoot') → mount full tree
    generation token     → overlapping switches cannot double-mount or fight (same pattern as
                           rendererRecovery Phase 1A)
```

Why unmount/remount instead of swapping views inside App: keeping App mounted keeps every provider,
the router and the query cache alive — that is precisely the footprint under test. Module-level
singletons (`store`, `AudioPlayer`, `QueuesManager`, scheduler) survive root unmount because ESM
module instances persist in the document. This is R2's mechanism and must be *proven*, not assumed
(§9).

### 4.2 Transition choreography

```text
ENTER TINY (from Standard/Compact mini):
  MiniPlayer context menu "Tiny (experimental)"        ← additive menu item (exposure clause)
    → window.api.miniPlayer.setMiniPlayerMode('tiny')   (main persists + applies geometry)
    → presentationHost.enterTinyRuntime()               (unmount full tree, mount tiny tree)

EXIT TINY (→ standard mini):
  Tiny context menu "Exit Tiny"
    → setMiniPlayerMode('standard'); geometry per standard branch
    → presentationHost.exitTinyRuntime()
    → full app remounts with store.playerType still 'mini' → MiniPlayer renders immediately

CRASH WHILE IN TINY:
  reload boots FULL app (cold-boot behavior unchanged — resolves Phase 0 open question about
  synchronous boot-mode knowledge: not needed, because boot is always full today)
    → RESTORE_PLAYER_TYPE_AFTER_RECOVERY('mini') → updatePlayerType('mini')
    → MiniPlayer mounts, settings query returns mode 'tiny' → effect calls enterTinyRuntime()
    (full app boots briefly first; transition cost is measured, not optimized — accepted)
```

### 4.3 Resolved open questions from Phase 0 §13
1. ~~Option A vs B~~ → B (done).
2. **i18n**: Tiny v1 ships English-only literals in its own components; shared-hook labels become
   injectable params (§5 Step B0-2). No i18n runtime in Tiny's graph after B0-1.
3. **Feature honesty**: Tiny keeps listening-data/Last.fm/Discord/taskbar/playback-state obligations
   (all event-driven from the shared player; near-zero cost). `useMediaSession` kept behind label
   injection; verified against main-side media-key path during implementation.
4. **Startup song restore**: `checkForStartUpSongs` + localStorage queue restore via
   `useAppLifecycle` unchanged.
5. **React Query**: none in Tiny. Settings reads/writes use plain preload calls.

## 5. Implementation Steps

### Step B0 — Enabling refactors (behavior-neutral, verified before anything else)

**B0-1 · Remove i18n from the store's static graph**
Files: `src/renderer/src/other/appReducer.tsx`, new `src/renderer/src/other/appShortcutsLabels.ts`,
`src/renderer/src/boot/fullBoot.tsx`.
Reason: `store.ts → appReducer.tsx → i18n` is the single contamination link in the playback-core
floor (§2.2). The keyboard-shortcut label table (appReducer lines ~488–644) is its only i18n usage;
shortcuts matching compares translated labels, so full-app behavior needs the labels hydrated before
first interaction — but Tiny never reads them.
Change: move label construction to `appShortcutsLabels.ts`; `DEFAULT_REDUCER_DATA.keyboardShortcuts`
starts empty; `fullBoot` awaits `hydrateKeyboardShortcutDefaults()` (dynamic import of the labels
module + dispatch) **before** rendering `<App/>`. Identical observable behavior for the full app;
Tiny's graph drops locale JSONs, i18next, react-i18next and the top-level-await settings init.
Verification: shortcuts prompt lists identical labels; shortcut activation works; resource-graph
re-check shows zero i18n/locale requests at `?boot=tiny`.

**B0-2 · Decouple `usePlaybackSettings` from React Query**
Files: `src/renderer/src/hooks/useUserPreferences.tsx` (read-only usage preserved), new
`src/renderer/src/other/equalizerPreference.ts`, `hooks/usePlaybackSettings.tsx`.
Reason: its only query dependency is `saveEqualizerPreset`. Extract a plain async function calling
the same preload API; `useUserPreferences` untouched for the full app.

**B0-3 · Inject fallback labels into `useMediaSession` / `useDiscordRpc`**
Files: those two hooks (+ call sites in App.tsx and tiny boot).
Reason: 7 total `t()` calls, all fallback strings. Add optional labels param whose default preserves
today's exact output when omitted... called from App with `t()` results (identical behavior), from
Tiny with English literals. No other change to these hooks.

**B0 gate:** full-app manual smoke (play, skip, favorite, EQ save, shortcuts prompt, Discord RPC if
enabled, mini modes) + existing unit suites green + `?boot=tiny` deny-list clean **before** B1 starts.

### Step B1 — Minimal Tiny runtime

Files/modules:
- `index.tsx` → thin loader (contents moved verbatim into `boot/fullBoot.tsx`)
- new `boot/presentationHost.ts` (mount/unmount/token logic)
- new `boot/tinyBoot.tsx`: minimal tree — `initializeQueuesManager`, `useAudioPlayer`,
  `useAppLifecycle` deps wired from allow-listed hooks (`useListeningData`, `usePlaybackSettings`,
  `usePlayerNavigation`; play/pause/skip via `AudioPlayer` API directly, avoiding
  `usePlayerControl`'s i18n prompts), crash-recovery message listener (same handler contract as
  App.tsx), `TinyPlayer`
- new `components/TinyMini/TinyPlayer.tsx` (+ small subcomponents): artwork
  (`optimizedArtworkPath` → original → default cover), title, artist, seek bar
  (`PositionTimerScheduler` consumption only), volume, favorite, prev/play/next, always-on-top,
  exit-to-mini control, minimal context menu. English-only literals. Plain CSS/tailwind classes, no
  animations/filters (per experiment design §10). UI primitives reused only if their own imports stay
  allow-list-clean (verify `Img`, sliders at implementation time; otherwise plain elements).
- `MiniPlayer.tsx`: additive context-menu item "Tiny (experimental)" calling the enter sequence
  (§4.2). No behavioral change to existing items/modes.
- Main process union + geometry: `schema.ts` `$type<'standard'|'compact'|'tiny'>` (varchar — no DB
  migration), `app.d.ts` UserSettings union, preload `setMiniPlayerMode` types, `main.ts`
  `setMiniPlayerMode` / `applyMiniPlayerModeConstraints` / `changePlayerType('mini')` /
  `resetMiniPlayerToDefault` gain `'tiny'` branches using new `@common/miniPlayerConstants`
  `TINY_*` constants (fixed height strip like compact; min/max constraints; saved-bounds handling
  mirroring the compact pattern).
Reason: exposes the experiment with the smallest possible surface; zero changes to Standard/Compact
behavioral paths (geometry branches keyed on mode value are additive).

### Step B2 — Integration verification

1. **R2 singleton proof**: from devtools/CDP evaluate referential equality of
   `window.__NORA_AUDIO_PLAYER__` vs freshly imported module instance across Normal→Tiny→Normal;
   exactly one `HTMLAudioElement` and one `AudioContext` in the document at all times.
2. **R1 transitions**: both directions while playing — assert no pause, no position reset, no queue
   reset, no volume change; record latency (measured, not optimized).
3. **Crash recovery with Tiny active**: extend `scripts/spike-crash-recovery.mjs` with a Tiny phase
   (enter Tiny → OS-kill renderer → assert auto-reload → restore into Tiny via §4.2 path → queue
   byte-identical).
4. **Feature honesty checks**: Discord RPC activity updates, Last.fm now-playing/scrobble fires,
   listening data recorded, taskbar buttons work — all while in Tiny.

### Step B3 — Benchmark scenario D + GO/NO-GO memo

- `benchmark-all-modes.mjs`: add `tiny` to `--modes` support driving the same three states
  (playing / n/a lyrics / queue n/a → playing + paused documented), same snapshot methodology,
  plus one CDP resource-graph capture per run (resource count, transferred JS, deny-list check) so
  the memory number and isolation evidence come from the same session.
- ≥3 runs, dev mode, identical methodology to P0 baselines; fill the pre-committed comparison table
  (Standard/Compact columns exist; add Tiny column incl. GPU WS, V8 heap, CPU, listeners, DOM nodes).
- Production-build resource-graph spot-check (Phase 0 caveat: Rollup shares chunks differently).
- Output: `architecture/tiny-mini/PHASE_1B_FINDINGS.md` + verdict strictly per §1 bands.
  **No decision or follow-up work happens inside B3's diff.**

## 6. Ownership & Invariants

1. Single playback engine: renderer `AudioPlayer` + `QueuesManager` + store — Tiny imports, never
   forks; exactly one instance across any transition (proven per B2-1).
2. Tiny configuration = existing shared Mini settings (`miniPlayerMode: 'tiny'`, pinned controls,
   always-on-top, geometry). Zero `tiny*` runtime/persisted state.
3. No new IPC channels; type-level unions + additive context-menu item only.
4. `playerType` semantics untouched; cold boot always full renderer; all mode entry is runtime chunk
   swap in the same document (audio continuity by construction, asserted per B2-2).
5. Position cadence exclusively from `PositionTimerScheduler`; artwork chain identical to Mini.
6. Standard/Compact components and styles: only the additive context-menu item touches them.

## 7. Testing Strategy

- **Unit**: `presentationHost` state machine (mount order, generation-token overlap protection,
  unmount-before-import failure handling); shortcuts hydration helper (labels hydrate once,
  idempotent). Existing suites stay green (esp. recovery tests).
- **Integration/empirical**: B2 list — these are acceptance criteria, not optional checks.
- **Regression**: benchmark script default run unchanged shape; Standard/Compact memory within noise
  of P0 baseline (recovery-style regression check); full-app manual smoke after each B0 refactor.
- **Performance**: the benchmark IS the deliverable — no optimization promises; bands decide.

## 8. Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Hidden consumers read `keyboardShortcuts` before hydration | Shortcuts dead until hydrated | Hydration awaited before full root render (B0-1); grep-audit consumers during B0; covered by smoke test |
| Root unmount leaks listeners (IPC/window) | Ghost listeners inflate Tiny's numbers / duplicate handlers on re-entry | Hooks' cleanup paths already exist; verify listener counts pre/post transition in B2 |
| Double-mount race (rapid mode flips) | Two roots fighting over #root | Host generation token; test in unit suite |
| Production chunking differs from dev spike | Verdict based on non-representative graph | B3 production-build spot-check mandatory |
| Geometry regressions in main mode functions | Breaks Standard/Compact resize behavior (different workstream!) | 'tiny' branches purely additive; run existing mini geometry behaviors in smoke test |
| Shared-floor weight dominates anyway | Tiny ≈ Compact ⇒ experiment answer is "discard" | That IS a valid result; reported honestly per bands |
| Context-menu edit touches Standard/Compact file | Scope discipline | Single additive item; diff review gate |

## 9. Verification Checklist (phase complete when)

- [ ] B0 gate passed (full-app smoke + suites green + tiny deny-list clean of i18n/query/locale/icon-font)
- [ ] R1/R2/B2 assertions recorded with data in `PHASE_1B_FINDINGS.md`
- [ ] Crash-in-Tiny recovery verified (spike extended, JSON archived)
- [ ] 4-mode benchmark table filled, ≥3 runs, methodology note included
- [ ] Production-build resource graph captured
- [ ] GO/NO-GO verdict stated strictly against §1 bands, deviations logged
- [ ] Diff review: no Standard/Compact behavioral changes; no new IPC channels; no `tiny*` persisted state

## 10. Out of Scope (explicitly)

Queue/lyrics drawers in Tiny, second BrowserWindow, playback ownership redesign, unresponsive-window
handling, Tiny i18n, production polish (transitions may be slow — measured, not optimized), and any
work on the separate mini-player correctness workstream unless proven necessary for Tiny.
