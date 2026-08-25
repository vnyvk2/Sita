# Phase 1A — Crash Recovery Foundation: Results

**Status: COMPLETE — all gates green.** Generic renderer crash recovery is in place and
empirically verified. Tiny (Phase 1B) inherits this infrastructure for free.

## What shipped

| Artifact | Purpose |
| --- | --- |
| `src/main/lifecycle/rendererRecovery.ts` | Testable recovery module: `attachRendererRecovery(webContents, deps, options)` |
| `src/main/main.ts` (`createWindow`) | One-block wiring with injected deps |
| `test/src/main/lifecycle/rendererRecovery.test.ts` | 11 unit tests covering the full state machine |
| `scripts/spike-crash-recovery.mjs` | Empirical verifier (updated: OS-level renderer kill + mini-mode phase) |
| `architecture/tiny-mini/spike_crash_recovery_phase1a.json` | Raw verification data |
| `src/types/app.d.ts` | New message code `RESTORE_PLAYER_TYPE_AFTER_RECOVERY` on the **existing** message channel (no new IPC channel) |
| `src/renderer/src/App.tsx` | Idempotent listener that re-enters the pre-crash presentation mode |

## Recovery state machine

```text
render-process-gone (reason != clean-exit)
  ├─ capture preCrashPlayerType = getPlayerType()   ← BEFORE reload
  ├─ rolling rate limit: max 3 reloads / 60 s
  │     └─ exceeded → onRecoveryLimitExceeded() → restartApp('renderer-crash-loop')
  └─ schedule webContents.reload() after 250 ms     ← deferred (see Finding 1)

did-finish-load (pending recovery present)
  ├─ consume single pending slot (latest generation wins; stale crashes cannot fire)
  ├─ onRecovered(preCrashPlayerType)
  │     └─ Main re-asserts presentation via RESTORE_PLAYER_TYPE_AFTER_RECOVERY (~6 s window)
  └─ schedule budget reset — only fires if the renderer stays healthy ≥ 30 s
```

## Findings

### Finding 1 — Synchronous `reload()` inside `render-process-gone` kills the whole process tree

Calling `webContents.reload()` directly inside the handler terminated Main + all children
instantly, with no JS exception (verified by A/B test with the handler disabled). Deferring
the reload by 250 ms so Chromium can finish tearing down the dead renderer fixes it completely.

### Finding 2 — Mini presentation does NOT self-restore after a reload

Mini/full presentation is **store-driven, not URL-driven**: entering mini mode never changes
the router location, and the renderer store resets to `'normal'` on any reload. Main's own
`playerType` and window geometry survive, but `changePlayerType()` early-returns on equality,
so without help the app recovers into a mini-sized window running the Normal UI.

Fix: Main re-asserts the pre-crash player type over the existing
`app/sendMessageToRendererEvent` channel for ~6 s after recovery; an idempotent App-level
listener dispatches `UPDATE_PLAYER_TYPE`. Repeats are no-ops once restored.

### Finding 3 — `Page.crash` is not a usable crash injector here

CDP `Page.crash` tears down the entire Electron instance in this environment (confirmed
again during Phase 1A). The spike now kills only the renderer process via the OS
(`electron.exe` filtered by `--type=renderer`), which produces a real
`render-process-gone` event with `reason: 'crashed'`.

## Empirical verification (dev mode, real renderer kills)

| Check | Result |
| --- | --- |
| Renderer dies, Main survives | ✅ |
| Window auto-reloads | ✅ (`recoveredViaAutoReload: true`) |
| CDP reconnects | ✅ |
| Persisted queue survives byte-identical | ✅ (66,481 bytes before == after) |
| Song state restores | ✅ (`currentSongId: 634` before == after) |
| Presentation mode restores | ✅ mini UI re-mounted, window still 369×65 |
| Window remains interactive | ✅ stable for the full observation window |

## Regression check

Same dev-mode methodology as the Phase 0 baselines:

| Mode | Renderer WS (Normally Playing) | Phase 0 baseline |
| --- | --- | --- |
| Standard MiniPlayer | 340 MB | 430–451 MB |
| Compact MiniPlayer | 422 MB | 430–451 MB |

JS heap unchanged (27.8–29.6 MB vs 28–38 MB baseline). No regression; the recovery module is
dormant listeners in the happy path.

## Unit tests

11/11 green (`npx vitest run test/src/main/lifecycle/rendererRecovery.test.ts`), covering:
clean-exit ignore · pre-crash capture ordering · deferred (non-synchronous) reload ·
single restore callback · unrelated did-finish-load ignored · 3-per-60s exhaustion ·
stability-gated budget reset · no reset on unstable recovery · rolling-window expiry ·
overlapping-crash generation overwrite (stale-callback protection) · detach.

## Invariant established (per Phase 1A goal)

> Any renderer presentation mode can crash and recover without corrupting persisted state
> or silently forcing Normal mode.

No Tiny-specific logic exists anywhere in this work. For Tiny later, recovery preserves
both pieces of state automatically: `playerType = 'mini'` via the existing path plus
`miniPlayerMode = 'tiny'` via persisted settings — nothing new required.

## Environment note

The worktree's `node_modules` was rebuilt via npm during Phase 0 and was subtly broken
(every `vi.mock` silently no-op'd due to a split vitest module instance under npm's layout;
the repo's committed `vitest.config.ts` self-alias assumes pnpm-style resolution).
`node_modules` now junctions to the main checkout's known-good install; tests pass again.
`package.json`, `package-lock.json`, and `vitest.config.ts` were restored to their committed
state (no dependency changes ship with this phase).

## Gate status

- [x] Gate 1 — Crash Recovery Foundation (Phase 1A): **DONE**
- [ ] Gate 2 — Minimal Tiny runtime + 4-mode benchmark → GO/NO-GO (Phase 1B)
