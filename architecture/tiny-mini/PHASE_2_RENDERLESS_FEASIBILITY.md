# Phase 2 — Renderless-Mini Feasibility Spike: FINDINGS

**Status: COMPLETE — one measurement, one verdict. No native/C++ work was started. HARD STOP honored.**

Reviewer-framed question: *Can Nora keep playback/state outside the renderer, terminate Chromium
while Mini is active, and land near ~100 MB total RAM?* The gate order agreed: measure the
renderer-less floor FIRST (pure measurement, zero new code); only if promising would audio-outside-
Chromium feasibility (P2) matter.

---

## Method (P1 — `scripts/spike-renderless-floor.mjs`)

1. Built app launched from worktree-local environment (own `node_modules`, created this session;
   main workspace untouched per instruction).
2. Crash-recovery auto-reload disabled **only in disposable `out/` artifacts** (event-name string
   patched) so an OS-killed renderer stays dead. Source unchanged.
3. Baseline samples of the FULL process tree → OS-kill renderer(s) → verified renderer stayed dead
   ≥15 s (CDP page target never returned) → 6 residual samples across ~30 s.
4. Metrics: per-role Working Set AND Private Working Set (trim-resistant), per-PID perf counters.

## Results

| State | Renderer | Main | GPU | Utility | Total WS | Total Private |
|---|---:|---:|---:|---:|---:|---:|
| Baseline (full tree) | 264.6 | 457.0 | 163.5 | 114.6 | **999.7** | 563.8 |
| **Residual median** (renderer gone) | 0 | **456.4** | 162.8 | 114.4 | **733.6** | **476.4** |

- Renderer stayed dead: ✅ (recovery patch held; CDP never returned)
- `reachesHundredMBTarget` (≤150 MB): ❌ — residual is **733.6 MB**

## Verdict

**The renderless route cannot reach ~100 MB. Terminating the entire Chromium renderer returns
only ~265 MB; the remaining tree still costs ~734 MB.** The reviewer's contingency ("if memory is
still ~200+ MB, Chromium wasn't the only major floor") triggered at more than 3× that threshold,
so the P2 audio-feasibility probe was skipped as decision-irrelevant.

### The reframed insight (the spike's real product)

The dominant consumer is **not** the renderer — it is the **MAIN process**: 457 MB WS /
371 MB Private even with zero UI. This is consistent with the current main-process architecture
(in-process PGlite/Postgres-WASM database, library lifecycle services, job scheduler, watchers).

Consequently:

> Any credible "tiny-footprint listening mode" is not a renderer/UI problem at all. It would
> require changing what the MAIN side keeps resident while Mini is active (suspension/idling of
> DB/library/scheduler subsystems), or a genuinely separate lightweight companion process —
> both are productization-scale efforts needing their own gated experiments.

## What this means for the Tiny arc

- Tiny (Phase 1B) answered: shrinking presentation ≠ RAM savings (paired Δ ≈ +8.6 MB, noise).
- This spike answers: even eliminating presentation *and* renderer ≠ RAM savings (floor 734 MB).
- Combined conclusion: **RAM-focused Mini work has no viable lever at the presentation or renderer
  layer in the current architecture.** The measured map of where the memory actually lives
  (Main 371 private · Renderer 86 private · GPU 92 private) is the actionable output for any
  future effort.

## Deviations / environment notes

1. Worktree received its OWN `node_modules` (junction removed; `npm install` locally) per
   reviewer instruction — main workspace untouched. Note: npm-layout installs previously broke
   vitest mocking in this worktree (Phase 1A note); unit suites were not needed for this spike.
2. Recovery-disable + renderer-path patches applied to disposable `out/` artifacts only;
   regenerate via `npm run build` restores stock behavior.
3. Main-workspace lockfile had drifted (`vitest` pin); reconciled earlier under separate approval.

## Artifacts

`p1_renderless_floor.json` · `spike-renderless-floor.mjs`

**Status: experiment closed. No further phases without explicit review.**
