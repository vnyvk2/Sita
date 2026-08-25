# Nora Memory Research Program — Experiment Log & Index

> Consolidated record of the Mini/memory research arc (2026-08). Every phase was gated:
> question → method → measurement → pre-committed interpretation → explicit review before
> proceeding. This document indexes all phases, their verdicts, and where every raw artifact lives.
>
> **Code archive:** the complete experimental implementation (Tiny runtime, presentation host,
> renderless probes) is preserved on branch `worktree/exp-mini`, commit `13d59801`. Measurement
> spike scripts referenced below live there; only crash recovery + this documentation + the
> benchmark script were promoted to master.

---

## Program timeline

```text
Phase 0  Feasibility & baselines .............. docs/plans + spike (no production code)
Phase 1A Generic renderer crash recovery ...... implemented, verified (KEPT)
Phase 1B/B0 Dependency-floor refactors ........ implemented (i18n/query decoupling)
Phase 1B/B1 Minimal Tiny runtime .............. implemented behind additive menu item
Phase 1B/B2 Integration proofs ................ R1/R2/crash/features — all PASS
Phase 1B/B3 Benchmark + consistency pass ..... measured; paired test collapsed the win
Phase 2   Renderless-Mini floor probe ......... measured; route eliminated
Phase 3   Main-process memory breakdown ....... see §Phase 3 below
```

## Final memory map (production build, this machine)

| Process | Private WS | Notes |
|---|---:|---|
| **Main (Node)** | **~371 MB** | dominant consumer — Phase 3 breaks this down |
| GPU | ~92 MB | Chromium compositor |
| Renderer | ~86 MB | the piece all UI-level optimization targets |
| Total tree | ~476 private / ~734–1000 WS | renderer-less residual measured at 733.6 WS |

---

## Phase 0 — Feasibility & baselines

**Question:** Can an isolated minimal Mini runtime exist without breaking playback, and what
exactly does the renderer load today?

**Method:** state-ownership audit, IPC contract inventory, Option A (separate document) vs
Option B (split bootstrap) build spike measured by *actual loaded resource graphs* over CDP.

**Key results:**
- Playback authority lives in the RENDERER (`AudioPlayer`, `QueuesManager`, localStorage) —
  corrected the original brief.
- Option A rejected with evidence: document navigation destroys the player singleton mid-song.
- Option B proven: Tiny stub boot loaded **5 resources/~1 KB** vs full app **489/~2,754 KB**,
  zero deny-list hits.
- Gap found: no `render-process-gone` handler existed at all.
- Dev-mode baselines recorded (Standard/Compact Mini ≈ 430–483 MB renderer WS; noisy).

**Verdict:** Conditional GO for Option B; crash recovery mandatory prerequisite.
Artifacts: [`PHASE_0_FINDINGS.md`](./PHASE_0_FINDINGS.md) · plans · spike scripts.

---

## Phase 1A — Generic renderer crash recovery ✅ KEPT

**Question:** Can any presentation mode survive a real renderer crash without corrupting state
or silently forcing Normal?

**Shipped:** `src/main/lifecycle/rendererRecovery.ts` (generation token, rolling rate-limit
3/60 s → restart, deferred reload, stability-gated budget reset) wired in `createWindow`;
presentation restore over existing message channel (`RESTORE_PLAYER_TYPE_AFTER_RECOVERY`);
11 unit tests; empirical verification incl. mini-mode restore (369×65) and byte-identical queue.

**Notable empirical findings:** synchronous `reload()` inside `render-process-gone` kills the
whole process tree (fixed with 250 ms deferral); mini presentation is store-driven and does NOT
self-restore after reload; CDP `Page.crash` unusable as injector (OS-level kill required).

**Status: merged into branch; benefits every mode; independent of Tiny's fate.**
Artifact: [`PHASE_1A_FINDINGS.md`](./PHASE_1A_FINDINGS.md).

---

## Phase 1B / B0 — Dependency-floor refactors ✅

**Question:** Is the playback-core module graph (what a minimal runtime MUST load) actually free
of full-app infrastructure?

**Found:** exactly one contamination link — `store.ts → appReducer.tsx → i18n` (~310 KB locales +
runtime + top-level-await init) — plus hook-level couplings (EQ-save→React Query;
media-session/Discord→i18n labels).

**Fixed (behavior-neutral):** lazy shortcut-label hydration (`appShortcutsDefaults.ts`),
plain-function EQ preset saver with query-invalidation listener preserved, label resolvers for
the two hooks. Entry split into loader → `boot/fullBoot.tsx`.

**Verified:** floor crawl 24 modules w/ i18n+locales (pre) → **17 modules zero hits** (post);
probe sensitivity proven against pre-B0 checkout; suite diff vs clean HEAD identical
(28 pre-existing failures both sides); functional smoke PASS.

One bug caught by gates: static storage import created a cycle entry edge (TDZ boot crash) →
dynamic-import boundary. Artifacts: [`PHASE_1B_B0_FINDINGS.md`](./PHASE_1B_B0_FINDINGS.md),
`b0_floor_probe_current.json`.

---

## Phase 1B / B1-B3 — Minimal Tiny runtime, proofs, benchmark ⚠️ → NO-GO (memory)

**Built:** `presentationHost` (token-guarded root swap, failure→restore), `tinyBoot` +
TinyPlayer (artwork/title/artist/seek/volume/favorite/transport/always-on-top/exit/context menu;
English-only; dependency-light), `'tiny'` geometry branches (additive), context-menu exposure.
Scope guard held by diff review: Compact/containers **zero diffs**.

**Integration proofs (all PASS):**
- R1 continuity: playing through Standard→Tiny→Standard — no interruption, position monotonic
  (two shared-code fixes required, both behavior-neutral: live-session guard on startup restore;
  removed pause-on-unmount that previously only fired at page teardown).
- R2 identity: player/QM references identical across swaps; ≤1 AudioContext, ≤1 audio element
  (constructor-counter proof). enter ≈2.6 s / exit ≈4.5 s (measured, not optimized).
- Crash-in-Tiny: auto-recovery → restored INTO Tiny (569×56), queue byte-intact, ≈8.1 s.
- Feature honesty: Last.fm/Discord/taskbar obligations fire inside Tiny (instrumented).

**Memory (the decision input):**

Unpaired production runs suggested Tiny ≈ 198 median vs Standard 241 — between the frozen bands.
**Paired alternating consistency pass (approved addendum) collapsed the advantage:**

| Pair | Std WS | Tiny WS | Δ |
|---|---:|---:|---:|
| 1 | 233.7 | 229.1 | −4.6 |
| 2 | 222.9 | 231.7 | **+8.8** |
| 3 | 223.9 | 232.6 | **+8.6** |

Median Δ **+8.6 MB (noise band ±9)**; Private-WS lens agreed. Real DOM 90 vs 118 (−24%) and
heap ≈12 vs 13 MB reproduce; working-set savings were residency noise. Bands were never moved.

**Verdict (per pre-committed rule): NO-GO for Tiny as a memory optimization.** Disposition
options recorded ((a) revert B0/B1 keep 1A / (b) dormant-merge / (c) archive) — reviewer's call.
Artifacts: [`PHASE_1B_FINDINGS.md`](./PHASE_1B_FINDINGS.md) + b1_*/b3_* JSONs.

---

## Phase 2 — Renderless-Mini floor probe ❌ route eliminated

**Question:** If playback/state lived outside Chromium and the renderer were TERMINATED in Mini
mode, would total RAM reach ~100 MB?

**Method:** built app with recovery disabled in disposable artifacts; OS renderer kill verified
permanent; per-role WS/Private sampling (6×30 s residual window).

**Result:**

| State | Total WS | Total Private | Main | GPU | Utility |
|---|---:|---:|---:|---:|---:|
| Full baseline | 999.7 | 563.8 | 457.0 | 163.5 | 114.6 |
| **Renderer-less residual** | **733.6** | **476.4** | **456.4** | 162.8 | 114.4 |

Renderer elimination saves ~265 MB → **734 MB remains; ≤150 MB gate failed decisively.**
P2 (audio-outside-Chromium probe) skipped as decision-irrelevant.

**Reframe discovered:** the dominant consumer is the **MAIN process (371 MB private)**, not
Chromium-renderer (86 MB private). Any real RAM effort must target what Main keeps resident
(DB/library/schedulers) or use a separate companion process — productization-scale, own gates.
Artifacts: [`PHASE_2_RENDERLESS_FEASIBILITY.md`](./PHASE_2_RENDERLESS_FEASIBILITY.md),
`p1_renderless_floor.json`.

---

## Phase 3 — Main-process memory breakdown ✅ composition identified

**Question:** What exactly accounts for ~371 MB Private in Main?

**Answer:** a single **~281 MB `JSArrayBufferData` — PGlite's `postgres.wasm` linear memory**
(76% of the 368 MB live V8 graph), plus ~88 MB actual JS objects and ~30 MB backing stores.
Ordinary app structures are negligible (top non-WASM entry ≈ 6 MB). Node 24 in this Electron
ships built-in `node:sqlite`, making a dependency-free SQLite path *possible* if a future gate
justifies it (A/B read-path experiment proposed; migration never presumed).

Artifacts: [`PHASE_3_MAIN_MEMORY_BREAKDOWN.md`](./PHASE_3_MAIN_MEMORY_BREAKDOWN.md) ·
`p3_main_heap_profile.json` · `spike-main-heap-profile.mjs`.

---

## Standing lessons (methodology)

1. Pre-commit decision bands; never move them post-hoc (held across B3 and the consistency pass).
2. Unpaired working-set snapshots lie by ±40 MB on this machine — pair everything, prefer
   Private WS, census DOM directly.
3. Prove loaded-resource graphs and singleton identities empirically; "chunks separated" and
   "window.api works" are not evidence.
4. Apply→measure→revert for any measurement-only source contact; disposable-artifact patches for
   build-output experiments.
5. Empirical gates catch real bugs (TDZ cycle, pause-on-unmount) that review alone missed.
