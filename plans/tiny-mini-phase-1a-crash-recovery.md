# Tiny Mini — Phase 1A Implementation Plan: Crash Recovery Foundation

> **Scope guard:** Phase 1A contains **no Tiny code**. It builds the renderer-crash recovery floor
> that any presentation mode (Normal / Standard / Compact / future Tiny) can rely on, and verifies
> existing modes are unchanged. Approved direction from the Phase 0 review:
>
> ```text
> Renderer crash
>      ↓
> Main detects render-process-gone
>      ↓
> Renderer reloads
>      ↓
> Existing persisted state restored
>      ↓
> Playback/queue state becomes valid
> ```
>
> Not required: playback continuation after a crash. Required: the window comes back, persisted
> state is intact, the queue restores, and no mode leaves the app unrecoverable.

---

## 1. Objective

Guarantee that a renderer process crash never leaves Nora permanently dead or in a corrupted state:

1. Main detects `render-process-gone` and reloads the renderer automatically.
2. Persisted queue (localStorage) and settings (DB) survive and are restored by the existing boot path.
3. The last presentation mode is honored after recovery (no forced jump to Normal unless recovery fails).
4. Recovery is bounded (no crash→reload→crash loops).

## 2. Current Behavior (verified)

- [`createWindow()`](../src/main/main.ts:334) attaches **no** `render-process-gone`, `did-fail-load`,
  or `unresponsive` handlers. A renderer crash today leaves a dead window (proven empirically in
  Phase 0 — CDP endpoint lost, no reload, app unrecoverable without restart).
- [`restartRenderer()`](../src/main/main.ts:1003) already implements a *manual* reload path:
  notifies the renderer (`app/beforeQuitEvent`), calls `mainWindow.reload()`, then forces
  `changePlayerType('normal')` if not already normal. Note: it **forces Normal**, which is wrong for
  crash recovery of a mini mode — recovery should restore the *previous* presentation, not punish
  the user.
- [`changePlayerType()`](../src/main/main.ts:1239) serializes transitions through
  `playerTypeTransitionPromise` and re-reads persisted geometry/mode from settings — reusable for
  post-crash restoration.
- Queue persistence is renderer-localStorage ([queuesManager.ts](../src/renderer/src/other/queuesManager.ts:56));
  it survives process death because it is written to disk continuously.
- Settings live in the main-process DB; unaffected by renderer crashes.

## 3. Problem / Root Cause

There is no automatic recovery path. Any renderer crash (including a future Tiny runtime bug) kills
the app. This blocks Phase 1B: introducing a second bootstrap surface without a recovery floor would
multiply unrecoverable-failure modes.

## 4. Proposed Design

### New module: `src/main/lifecycle/rendererRecovery.ts`

Main-process module owning crash recovery, kept separate from `main.ts` so it is testable and so
Phase 1B can extend it (e.g., restoring `miniPlayerMode: 'tiny'`):

```text
attachRendererRecovery(webContents, deps)
  ├── webContents.on('render-process-gone', handleRenderProcessGone)
  ├── webContents.on('did-finish-load',  → clear retry backoff, mark healthy)
  └── handleRenderProcessGone(event, details)
        ├── ignore reason === 'clean-exit'
        ├── log details (reason, exitCode) via logger
        ├── if details.reason === 'unresponsive' → do nothing yet (wait/recover strategy below)
        ├── rate-limit: max 3 recoveries per 60 s rolling window
        │     └── exceeded → log error, show dialog "Nora hit an unrecoverable error", relaunch app
        ├── else → mainWindow.webContents.reload() (preserving current URL)
        └── after reload, main re-applies current presentation:
              if playerType !== 'normal' → re-run changePlayerType(playerType)
              (restores window size/position/aspect/always-on-top from settings)
```

Design decisions:

| Decision | Choice | Reason |
|---|---|---|
| Reload vs recreate window | `webContents.reload()` | Window chrome/geometry untouched; cheaper; matches existing `restartRenderer` precedent |
| Restore presentation? | Yes — re-invoke `changePlayerType(current)` | Today's `restartRenderer` forces Normal; crash recovery must not change user-visible mode |
| `unresponsive` | Log only in 1A | Hangs need different UX (ANR dialog); out of scope — documented, not silently mixed in |
| Crash loop protection | 3 per rolling 60 s, then relaunch | Prevents boot-crash loops; relaunch gives a clean process |
| Which reasons to recover | everything except `clean-exit` | Electron reasons: `crashed`, `oom`, `launch-failed`, ... all benefit from one reload attempt |

### Wiring

Single line in [`createWindow()`](../src/main/main.ts:334) after window creation:
`attachRendererRecovery(mainWindow.webContents, { getPlayerType: () => playerType, changePlayerType })`.

Dependency injection keeps the module free of `main.ts` imports (testability + avoids circular imports).

## 5. Ownership & Invariants

1. Main owns recovery decisions; the renderer is passive (it may be dead).
2. Recovery never mutates persisted settings except through the existing `changePlayerType` path
   (which persists geometry as a normal user action would).
3. Exactly one recovery authority: `rendererRecovery.ts`. No other module may call `reload()` on
   crash (existing `restartRenderer` remains for its explicit user-facing purpose).
4. Recovery is bounded — unbounded crash loops are impossible.
5. Playback state loss on crash is accepted and logged; queue/settings integrity is mandatory.

## 6. Implementation Steps

### Step 1 — Recovery module
Files: `src/main/lifecycle/rendererRecovery.ts` (new), `src/main/lifecycle/` already exists.
Reason: isolate testable logic; inject `getPlayerType`/`changePlayerType`/logger.

### Step 2 — Wire into createWindow
Files: [`src/main/main.ts`](../src/main/main.ts:354).
Reason: single wiring point; no behavior change until a crash actually occurs.

### Step 3 — Post-reload presentation restore
Files: `rendererRecovery.ts` (after `did-finish-load` following a recovery reload, invoke
`changePlayerType(getPlayerType())` once).
Reason: without this, a crashed Standard/Compact Mini comes back as a full-size Normal window with
stale aspect ratio constraints.

### Step 4 — Tests
Location per project conventions: `test/src/main/lifecycle/rendererRecovery.test.ts`.

Unit (mocked `webContents` EventEmitter):
- `clean-exit` does NOT trigger reload.
- `crashed` triggers exactly one `reload()`.
- 3 crashes within 60 s trigger reloads; 4th triggers `app.relaunch()` path instead.
- A `did-finish-load` after recovery resets the rate window.
- Presentation restore invoked with the pre-crash player type and only once.

### Step 5 — Empirical verification (re-run Phase 0 crash spike)
Files: reuse [`scripts/spike-crash-recovery.mjs`](../scripts/spike-crash-recovery.mjs).
Procedure: boot → play → snapshot queue → `Page.crash` → expect automatic reload → verify:
queue restored (`activeQueueRestored=true`, same song ids), settings readable, player singleton
recreated, window usable. Repeat once more to exercise the backoff counter reset.

### Step 6 — Regression check
Run the existing benchmark once (`--modes=main,standard,compact`) and confirm numbers within the
run-to-run noise of the P0 baseline (recovery wiring must be free in the happy path).

## 7. Risks

| Risk | Mitigation |
|---|---|
| Crash loop during boot (module-level throw) | Rate limiter + relaunch escape hatch |
| `did-finish-load` fires before recovery bookkeeping ready | Guard flags inside module; idempotent handlers |
| Restoring mini mode re-triggers resize side effects | Reuse existing serialized `changePlayerType` (already handles geometry healing) |
| Dev-only extension interference (React devtools) on reload | Existing `restartRenderer` precedent shows reload is safe |

## 8. Verification checklist

- [ ] Unit tests green for all recovery branches.
- [ ] Spike: crash → auto-reload → queue restored → same presentation mode → window interactive.
- [ ] Second consecutive crash exercises backoff correctly.
- [ ] Benchmark regression within noise.
- [ ] `git diff` touches only: new lifecycle module, one wiring line in `main.ts`, new test file, spike script reuse.

## 9. Explicitly out of scope (Phase 1B+)

Any Tiny code, bootstrap split, `miniPlayerMode: 'tiny'`, playback continuation across crashes,
`unresponsive` UX, production-build benchmarks.
