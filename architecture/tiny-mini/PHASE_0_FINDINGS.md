# Tiny Mini — Phase 0 Findings & Go/No-Go Memo

Date: 2026-08-24 · Branch: `worktree/exp-mini` · Methodology: [`plans/tiny-mini-phase-0.md`](../../plans/tiny-mini-phase-0.md)

---

## TL;DR

| Gate | Result |
|---|---|
| Playback gate (R1) | **Option A REJECTED** — document navigation provably destroys the player instance and interrupts playback. **Option B passes** (same document, no navigation). |
| Isolation gate (R4) | **Option B PROVEN** at the loaded-resource level: Tiny boot = **5 JS resources / ~1 KB** vs full boot = **489 JS resources / ~2,754 KB**, zero deny-list hits. |
| Memory gate (§6 of plan) | **NOT YET MEASURABLE** — requires the real TinyPlayer (Phase 1). Baselines recorded below. |
| Crash recovery (P0-5) | **GAP FOUND** — no `render-process-gone` handler exists; a renderer crash is unrecoverable today. Must be addressed before/with Phase 1. |

**Recommendation: CONDITIONAL GO for Phase 1 planning on Option B** (split bootstrap), with the
crash-recovery handler as a mandatory prerequisite. The final go/no-go on Tiny itself remains gated
on the §6 memory criteria measured against the real Tiny runtime.

---

## 1. Baseline (P0-1)

Three runs of [`scripts/benchmark-all-modes.mjs`](../../scripts/benchmark-all-modes.mjs) in dev mode
(`memory_report_p0_run1/2/3.json`). Environment: Windows 11, Electron 41.7.2, Node 24, dev server,
existing library state.

Renderer WS while "Normally Playing" (MB):

| Run | Normal | Standard Mini | Compact Mini |
|---|---:|---:|---:|
| 1 | 278.6 | 431.7 | 430.3 |
| 2 | 314.0 | 460.0 | 450.9 |
| 3 | 314.5 | 482.8 | 220.3* |

V8 heap (JS heap used): 28–38 MB across all modes/runs — consistent with the historical ~31 MB figure.

\* run 3 shows OS working-set trimming artifacts (several snapshots dropped sharply mid-run);
working-set numbers in dev mode are noisy. Observations:

- Dev-mode renderer WS is materially higher than the quoted production baseline (~280–300 MB).
  **The future Tiny measurement must use this exact same methodology for comparability**, or a
  production-build comparison must be added.
- Standard vs Compact differ by far less than the runtime they share — consistent with the premise
  that the shared full-renderer runtime dominates.
- Script fixes made during P0-1 (additive): `--modes` flag, DOM-node metric, explicit
  `REMOTE_DEBUGGING_PORT` env (main reads the env var, not the CLI flag), and stripping
  `ELECTRON_RUN_AS_NODE` (VSCode terminals set it, which crashes Electron startup).

## 2. State ownership (P0-2)

Full audit: [`STATE_OWNERSHIP.md`](./STATE_OWNERSHIP.md). Headline corrections to the original brief:

- Playback/queue authority lives **in the renderer** (`AudioPlayer`, `QueuesManager`, localStorage),
  not in Main/DB. Tiny must reuse these modules as the single engine.
- Existing Mini components are **not reusable** for Tiny: they hard-depend on React Query, i18n, and
  the ~30-callback `AppUpdateContext`. Tiny v1 needs its own minimal component set (which is also
  what makes the isolation measurement meaningful).

## 3. IPC contract (P0-3)

Full inventory: [`TINY_IPC_CONTRACT.md`](./TINY_IPC_CONTRACT.md). **Zero new channels required.**
One type-level union extension (`setMiniPlayerMode: 'tiny'`) plus one open question: how the boot
loader learns the persisted mode synchronously before mount.

## 4. Build spike (P0-4)

Spike code was applied, measured, then **reverted** — production entry
[`index.tsx`](../../src/renderer/src/index.tsx) is back to its original single-root bootstrap.
Methodology preserved in [`../scripts/spike-tiny-resource-graph.mjs`](../../scripts/spike-tiny-resource-graph.mjs);
raw results in [`spike_resource_graph.json`](./spike_resource_graph.json).

### Option B — split bootstrap (same document)

The entry was temporarily converted to a loader dynamically importing either the full app root or a
dependency-free stub (`?boot=tiny`), then the actual network-loaded resource graph was captured via CDP:

| Boot | JS resources | Transferred JS | Deny-list hits (router/routeTree/query/i18n/icon-font/pages) |
|---|---:|---:|---|
| `?boot=tiny` | **5** | **~1 KB** | **none** |
| `?boot=full` | 489 | ~2,754 KB | (expected: all present) |

- Regression check: the refactored full boot remained fully functional (playback started, UI interactive).
- **R4 satisfied:** isolation is proven by the loaded resource set, not chunk names. In dev, Vite
  serves the true module graph, so "5 resources" means the router/query/library modules were never
  even requested.
- Caveat for production: Rollup bundling shares common chunks differently than dev; Phase 1 must
  re-run this measurement against the production build.

### Option A — separate document

While playing (`paused=false`, `currentTime=2s`), a marker (`__spikeMarker=42`) was set on the live
player singleton, then the document navigated:

```text
after nav: markerStillPresent = false   ← DIFFERENT instance, fresh JS context
           paused = true, currentTime = 0 ← playback interrupted, position lost
```

Document navigation destroys the execution context owning the `HTMLAudioElement`/`AudioContext`.
**Option A fails hard requirement R1 → rejected** (matching the predicted verdict), unless a future
phase moves playback out of the renderer — explicitly out of scope.

## 5. Crash recovery & persistence (P0-5)

Empirical test ([`../scripts/spike-crash-recovery.mjs`](../../scripts/spike-crash-recovery.mjs)):

- Pre-crash state verified: queue persisted to localStorage (`queuePersisted=true`,
  `currentSongId=634`, ~66 KB persisted blob).
- After `Page.crash`: **the app never recovered.** No `render-process-gone` handler exists in
  [`main.ts`](../../src/main/main.ts); the CDP endpoint never came back and no reload occurred.
  The post-crash restore path therefore **could not be verified because it does not exist**.

**Finding:** the invariant "a Tiny renderer crash must not corrupt persisted queue/settings state"
is *probably* satisfied (localStorage/settings DB are on disk and survived the process death), but
the second half — "the existing restore path recovers correctly" — has **no existing path to verify**.
Phase 1 must add a `render-process-gone` handler that recreates/reloads the window and restores the
last presentation mode, then re-run this spike to close the loop.

## 6. Decision per plan §6 criteria

| Criterion | Status |
|---|---|
| Architecture exists that isolates Tiny without breaking playback | ✅ Yes (Option B), proven at resource level |
| Option A viable? | ❌ Rejected (R1) |
| IPC ready? | ✅ Zero new channels |
| Ownership model clear? | ✅ Allow/deny list written |
| Tiny renderer WS materially below baseline? | ⏳ Requires Phase 1 TinyPlayer to measure |
| Crash recovery path exists? | ❌ Gap — prerequisite for Phase 1 |

**Recommended next step:** review this memo. If accepted, plan Phase 1 (minimal Tiny renderer on
Option B) including the crash-recovery handler as Step 0. If Tiny's eventual measurements land
≥280 MB renderer WS (plan §6 failure band), discard the experiment per the pre-committed criteria.

## 7. Deviation log

- Spike scripts kept under `scripts/` (inert tooling, no production impact) so measurements are reproducible.
- `package-lock.json` updated by `npm install` (lockfile was out of sync with `package.json`; `npm ci` refused).
- `routeTree.gen.ts` regenerated identically by the TanStack router plugin during dev runs.
