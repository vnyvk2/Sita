# Phase 1B — Minimal Tiny Runtime + Benchmark: FINDINGS & GO/NO-GO MEMO

**Status: B1+B2+B3 COMPLETE. This memo is the pre-committed decision gate. No further work was done beyond it.**
Plan: [`plans/tiny-mini-phase-1b-tiny-runtime.md`](../../plans/tiny-mini-phase-1b-tiny-runtime.md) · B0 results: [`PHASE_1B_B0_FINDINGS.md`](./PHASE_1B_B0_FINDINGS.md)

---

## TL;DR verdict

| Gate | Result |
|---|---|
| R1 playback continuity (Mini→Tiny→Mini, playing) | ✅ PASS — song/queue/volume preserved, position monotonic, **audio never interrupted** |
| R2 singleton identity | ✅ PASS — same `AudioPlayer`/`QueuesManager` references across both swaps; exactly 1 `AudioContext`, 1 `HTMLAudioElement` (construction-counter proof) |
| Crash recovery while in Tiny | ✅ PASS — Main survives → reload → restore into Tiny automatically; queue byte-intact; geometry = tiny strip |
| Feature honesty inside Tiny | ✅ PASS — Last.fm now-playing, Discord RPC updates, taskbar playback-state all fire (instrumented evidence) |
| Memory verdict vs pre-committed bands | ⚠️ **WEAK-to-BORDERLINE (explicit review required)** — see below |

**The bands were not moved.** The measured outcome lands between them, and the plan's §6 rule
("between bands: evaluate based on measured resource/runtime cost") applies. Decision deferred to
the reviewer with the full data below.

---

## 1 · What was built (B1)

```text
index.tsx (loader)
   └── boot/fullBoot.tsx (auto-mounts full app; exports mountFullApp)
   └── boot/presentationHost.ts (generation-token root swap; failure → restores full runtime)
        └── boot/tinyBoot.tsx (mounts components/TinyMini/TinyRuntime on demand)

TinyRuntime wiring (feature-honest subset):
  initializeQueuesManager · useAudioPlayer (+ PositionTimerScheduler) · useListeningData
  usePlaybackSettings · usePlayerNavigation · useQueueManagement · startup-restore (guarded)
  play/pause→store+taskbar IPC · beforeQuit position save · canplay autoplay · media-key/taskbar/
  unknown-source subscriptions · useDiscordRpc · useMediaSession   ← all shared modules, zero forks

TinyPlayer UI: artwork(opt→orig→default) · title/artist · seek · volume · favorite · prev/play/next
  · always-on-top · reset · exit-to-standard · minimal context menu. English-only literals,
  plain elements, no animations (per experiment design).

Exposure surface (additive only):
  MiniPlayer context menu "Tiny (experimental)" · main-process 'tiny' geometry branches
  · TINY_MINI_PLAYER_HEIGHT=56 / MIN_WIDTH=280 · schema/preload/app.d.ts union extensions
```

**Scope guard verified by diff review:** `CompactMiniPlayer.tsx` and all `MiniPlayer/containers/*`
have **zero diffs**; `MiniPlayer.tsx` contains only the three additive blocks above; existing
standard/compact geometry branches untouched ('tiny' is a new branch everywhere).

## 2 · Issues found & fixed during integration (B2's purpose)

| # | Finding | Fix | Existing-flow impact |
|---|---|---|---|
| F1 | Entering Tiny re-ran cold-boot restore → source reload → position reset + pause | Live-session guard (`player.src && queue.currentSongId`) in `useAppLifecycle` restore AND Tiny's copy | None: cold boot & crash-reload always have empty `src`; guard never triggers there |
| F2 | `useAppLifecycle` cleanup called `toggleSongPlayback(false)` on unmount → paused playback at every swap | Removed from cleanup | None: full App previously unmounted only at page teardown, where pausing was meaningless |
| F3 | First-cut B0 cycle crash (already documented in B0 findings) | dynamic import boundary | — |

## 3 · Empirical verification data

### 3.1 Transitions proof — `b1_transitions_proof.json` (dev)
```
playbackStarted      paused=false pos=3.43s
enteredStandardMini  paused=false pos=6.98s
enteredTiny          paused=false pos=7.27s   ← continuous through the swap
exitedStandardMini   paused=false pos≈12s
finalClockCheck      paused=false pos=16.12s  ← clock never stopped
playerSameRef/qmSameRef true after both swaps · audioContexts≤1 · audioElements≤1
enterTiny ≈ 2.6 s · exitTiny ≈ 4.5 s (measured, not optimized)
```

### 3.2 Crash-in-Tiny — `b1_crash_recovery_tiny.json`
```
before: song 1280 playing @8.0s, tiny mounted, queue 1297
OS-kill renderer → Main survives → auto-reload → full boot → RESTORE('mini')
  → MiniPlayer mounts → persisted mode 'tiny' → auto handover to Tiny runtime
after:  tiny remounted ✓ · window 569×56 ✓ · song 1280 ✓ · queue 1297 ✓ · localStorage 67,061 B intact
recovery ≈ 8.1 s (playback-state loss on crash remains the documented accepted invariant)
```

### 3.3 Feature honesty — `b1_feature_honesty.json`
Inside Tiny, two UI skips produced track changes (1280→946→727) plus instrumented call-site
evidence: `lastfm nowplaying` per track · `discord rpc` on playback events ·
`playbackState=true` taskbar obligation. (Source instrumentation applied → measured → reverted.)

### 3.4 Static gates
Typecheck/lint clean on all B1 files · full unit suite diffed against clean HEAD: **zero new
failures** (B1's 28 pre-existing ⊂ HEAD's 31 flaky-inclusive set) · touched suites green.

---

## 4 · THE NUMBERS (decision input)

### 4.1 Production build (band-comparable; 3 independent runs, playing state, renderer WS MB)

| Mode | Run 1 | Run 2 | Run 3 | Median |
|---|---:|---:|---:|---:|
| Normal | 228.4 | 223.1 | (metric glitch) | ≈ 226 |
| Standard Mini | 240.9 | 209.6 | 251.3 | **241** |
| Compact Mini* | — | — | — | not separately captured in prod runs |
| **Tiny** | **246.1** | **198.4** | **166.5** | **198** |

\* prod flow measures Normal → Standard → Tiny; Compact omitted for session-time reasons (dev table covers it).

Matched-run comparison: Tiny ≤ Standard in every run (−5 / −11 / −85 MB); never exceeded it.

**Secondary resources (Run 1, matched):**

| Metric | Standard Mini | Tiny | Δ |
|---|---:|---:|---|
| GPU WS (MB) | 148.5 | 131.0 | −12% |
| JS heap (MB) | 13.2 | 11.7 | −11% |
| Event listeners | 392 | 256 | **−35%** |
| Real DOM nodes | 768 | **90** | **−88%** (verified via DOM census; CDP `Nodes` metric lags post-reload) |

### 4.2 Dev-mode benchmark (scenario D added to `benchmark-all-modes.mjs`; 3 runs)

Renderer WS playing (MB):

| Mode | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Normal | 294.4 | 308.1 | 310.2 |
| Standard Mini | 459.6 | 483.9 | 452.3 |
| Compact Mini | 451.6 | 445.3 | 326.9* |
| **Tiny** | **344.6** | **343.9** | **227.4*** |

\* OS working-set trimming artifacts (same phenomenon documented in P0 run 3).
Tiny resource graph captured in-session (`memory_report_p1b_run*.json`); cumulative-session caveat noted.

## 5 · Verdict against the pre-committed bands (plan §6 — unchanged)

### 5.1 ⚠️ CONSISTENCY PASS RESULT (post-review addendum — this supersedes §5.2's provisional reading)

After the initial memo data, a **paired alternating consistency pass** was run
(`spike-prod-paired-consistency.mjs`, approved scope: measurement-only): three Standard→Tiny
cycles inside one session, each half measured identically (persist mode → reload → real UI entry
→ 12 s settle), adding trim-resistant **Private Working Set** per-PID counters.

| Pair | Standard WS | Tiny WS | Δ | Std PrivWS | Tiny PrivWS | Δ Priv |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 233.7 | 229.1 | −4.6 | 91.2 | 87.4 | −3.8 |
| 2 | 222.9 | 231.7 | **+8.8** | 81.2 | 89.9 | +8.7 |
| 3 | 223.9 | 232.6 | **+8.6** | 82.1 | 90.7 | +8.6 |
| **Median** | 223.9 | 231.7 | **+8.6** | 82.1 | 89.9 | **+8.6** |

**Interpretation (per the pre-agreed outcome rule):**

> *If paired deltas collapse toward zero → the apparent WS advantage was mostly residency noise.*

They collapsed. Median Δ = **+8.6 MB (zero within the ±9 MB noise band)**; Tiny exceeded Standard
in 2 of 3 matched pairs. The earlier −43 MB median and the striking −85 pair were **ambient
working-set drift**, not application savings — confirmed independently by the trim-resistant
private-WS lens agreeing at ≈ +8.6.

What remains real and reproducible under matched conditions:
- Real DOM: **90 vs 118 nodes (−24%)** every cycle · V8 heap ≈ 12 vs 13 MB.
- These are structural, but small in absolute terms.

### 5.2 Original unpaired reading (retained for transparency)

```text
≥ 280 MB   FAILURE → discard            NOT triggered (median 198; max observed 246)
~250 MB    WEAK → explicit review       ← unpaired medians landed here
120–180 MB STRONG → proceed             Run 3 hit 166; median did not

A renderer floor dominates: even Normal mode measures ~225 MB in this environment today;
the Chromium floor — not the app tree — caps what any presentation-level architecture can save.
```

## 5b · FINAL VERDICT (consistency-informed)

**NO-GO recommendation for Tiny as a memory optimization — per the pre-committed rule.**

- Matched-condition evidence shows **no reproducible renderer-WS advantage** (Δ median +8.6 MB,
  noise band ±9). Bands were never gamed: the unpaired numbers that looked weak-promising do not
  survive pairing.
- Absolute footprint (~230 MB either way) sits in failure/weak territory against the frozen bands
  regardless of pairing.
- The experiment succeeded at its actual job: **it prevented shipping a third presentation mode
  for a phantom saving**, and it produced durable by-products:
  - Generic crash-recovery infrastructure (Phase 1A — justified independently, benefits all modes).
  - `presentationHost` + split bootstrap (dormant, dependency-clean floor proven by B0).
  - Documented floor measurements useful for any future renderer-memory work.

**Disposition options for the code (reviewer's call):**
(a) revert all B0/B1 renderer changes, keep Phase 1A recovery + docs;
(b) merge everything as dormant experimental infrastructure behind the additive menu item;
(c) keep on branch unmerged for future reference.
No option above changes the verdict: **do not productize Tiny on memory grounds.**

## 6 · Decision requested (reviewer)

**Superseded by §5b: the consistency pass (approved scope) produced a NO-GO recommendation via
the pre-committed outcome rule.** The reviewer retains final sign-off on the disposition option
((a) revert / (b) dormant-merge / (c) archive-branch) — no further Tiny work accompanies any of
them.

**No automatic next phase exists.** Whichever option is chosen, Tiny work stops here until an
explicit decision is recorded.

## 7 · Deviation & incident log

0. **Consistency-pass environment incident:** the MAIN checkout's `node_modules` was externally
   wiped mid-session (second electron-related loss that day). Restored via `npm install` in the
   main workspace with reviewer approval ("now its free you can use main workspace"); this
   refreshed the main `package-lock.json` (vitest 4.1.8→4.1.11 reconciliation — same class as the
   Phase 0 lockfile deviation). Worktree junction configuration unchanged.
1. **Pre-existing production-build bug discovered (separate workstream!):** built main resolves
   `out/main/renderer/index.html` because `loadFile(join(import.meta.dirname,'../renderer…'))`
   lives inside a chunk after bundling → `electron-vite preview` / direct-built launches show an
   error page. Workaround applied to disposable `out/` artifacts only for this measurement;
   **source fix belongs to the window/build workstream**.
2. Main-checkout `node_modules/electron/dist` was found wiped mid-session (unrelated to this
   branch); restored via electron's own `install.js`. No dependency versions changed.
3. Prod measurement initially attached to a stale error-page target and zombie instances polluted
   OS aggregates → script now hard-kills until zero processes remain and probes for `window.api`.
4. StrictMode double-invocation doubles dev-mode obligation logs (matches full-app behavior).
5. `routeTree.gen.ts` regenerated identically by the router plugin during dev runs.
6. Consistency-pass run had `playback started: false` (no startup song auto-restored in that
   session); memory snapshots unaffected and symmetric across both halves; noted for honesty.

## 8 · Artifacts index

`b1_transitions_proof.json` · `b1_crash_recovery_tiny.json` · `b1_feature_honesty.json` ·
`b3_production_measure_1/2/3.json` · **`b3_paired_consistency.json`** ·
`memory_report_p1b_run1/2/3.json` ·
scripts: `spike-tiny-transitions.mjs`, `spike-tiny-crash-recovery.mjs`,
`spike-tiny-feature-honesty.mjs`, `spike-prod-measure.mjs`, `spike-tiny-floor-probe.mjs`,
**`spike-prod-paired-consistency.mjs`**
