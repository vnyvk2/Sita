# Phase 1B — B0 Enabling Refactors: Results

**Status: COMPLETE — all B0 gates green. HARD STOP respected: no Tiny runtime code (B1) was written.**
Plan: [`plans/tiny-mini-phase-1b-tiny-runtime.md`](../../plans/tiny-mini-phase-1b-tiny-runtime.md) · Scope guard honored: exactly the three approved dependency edges were broken, nothing else.

## What shipped

| Step | Change | Files |
|---|---|---|
| B0-1 | Shortcut-label table + `normalizedKeys` extracted out of the store's static graph; defaults now hydrate before first render; entry split into thin loader + `boot/fullBoot.tsx` (contents verbatim; **no Tiny branch yet**) | new `other/appShortcutsDefaults.ts`, `boot/fullBoot.tsx`; edited `other/appReducer.tsx` (-167 lines), `other/appShortcuts.tsx`, `utils/localStorage.ts`, `hooks/useKeyboardShortcuts.tsx`, `index.tsx`, test |
| B0-2 | EQ-preset save extracted to a plain IPC-calling module; query-cache invalidation preserved via a listener registered by `useUserPreferences` (full app keeps identical behavior; Tiny registers nothing) | new `other/equalizerPreference.ts`; edited `usePlaybackSettings.tsx`, `useUserPreferences.tsx` |
| B0-3 | `useMediaSession` / `useDiscordRpc` take label resolvers instead of importing react-i18next. App passes `t()`-keyed callbacks so resolver identity — and therefore effect re-runs on language change — matches previous dynamics exactly | edited both hooks, `App.tsx` |
| tooling | Floor-graph probe (kept as inert spike tooling like its P0 siblings) | `scripts/spike-tiny-floor-probe.mjs` |

## Bug found and fixed during verification

The first cut of B0-1 statically imported `utils/localStorage` from `appShortcutsDefaults.ts`,
creating a NEW cycle entry edge (`localStorage → store → storage`) that crashed boot with
`ReferenceError: Cannot access 'storage' before initialization` at [store.ts](../../src/renderer/src/store/store.ts)
— caught by the dev-boot smoke, fixed by loading storage dynamically inside
`installDefaultKeyboardShortcuts()`. Re-verified clean.

## Gate results

### 1 · Typecheck & lint
All B0-touched/new files type-clean (`typecheck:web`) and lint-clean (`oxlint`). Remaining repo errors/warnings are the pre-existing branch-wide set, untouched (verified by comparing against a clean-HEAD worktree).

### 2 · Unit tests — zero regressions
Full suite JSON-diffed against clean HEAD (`8f2b35f8`) in a temp worktree:
`28 failed | 1719 passed` on BOTH — **failure sets are byte-identical** (all pre-existing).
Directly touched suites pass: `useKeyboardShortcuts.test.tsx` (7/7, updated for async reset) + `rendererRecovery.test.ts` (11/11).

### 3 · Boot-floor resource graph — contamination removed (R4 evidence)
New methodology after in-page probing proved unreliable (Vite IPv6-only binding + SPA-fallback paths): crawl Vite's transformed module graph over HTTP and deny-list-check the transitive **static-import closure** of the exact modules a Tiny runtime imports. Dynamic `import()` edges recorded separately (lazy = user-action-only).

| Checkout | Boot closure | i18n/locales/i18next/query/route hits | Verdict |
|---|---:|---|---|
| HEAD (pre-B0) | 24 modules | **5 locale JSONs + i18n.ts + i18next + react-i18next** | CONTAMINATION (probe exit 3) |
| B0 worktree | **17 modules** | **zero** | CLEAN |

Bare deps in B0 closure: `@tanstack/store`, `react`, `roundTo` only.
Sensitivity requirement satisfied: the same probe provably detects the pre-B0 edge
(`b0_floor_probe_baseline_sensitivity.txt`). Artifacts: `b0_floor_probe_current.json`.

### 4 · Functional smoke (real dev app, CDP-driven)
```
shortcutsHydrated : true   (defaults present pre-render; categories populated)
songRestored      : true
miniMounted       : true   (.mini-player mounts via real UI button)
miniInteractive   : true
normalRestored    : true
floorApiOk        : true
```
Artifact: `b0_functional_smoke.json`.

## Deviations log
1. Cycle TDZ bug introduced then fixed during B0-1 (documented above) — this is why empirical gates exist.
2. Probe methodology replaced page-context dynamic-import measurement with static-graph crawling; sensitivity-checked against pre-B0 checkout.
3. `resetShortcutsToDefaults` is now async (defaults built lazily); sole UI call site is fire-and-forget compatible; unit test updated to await it.
4. `routeTree.gen.ts` regenerated identically by the TanStack router plugin during dev runs.

## Gate status
- [x] Gate 1 — Crash Recovery Foundation (Phase 1A)
- [ ] Gate 2 — Minimal Tiny runtime + 4-mode benchmark (Phase 1B)
  - [x] **B0 — enabling dependency-graph refactors: COMPLETE, all gates green**
  - [ ] **B1 — minimal Tiny runtime: NOT STARTED (hard stop honored; requires explicit approval)**
