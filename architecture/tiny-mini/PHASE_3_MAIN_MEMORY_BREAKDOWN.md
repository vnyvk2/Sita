# Phase 3 — Main-Process Memory Breakdown: FINDINGS

**Status: composition measured. No optimization implemented. HARD STOP honored.**

Reviewer question: *What exactly accounts for the ~371 MB Private Main-process footprint?*
(Phase 2 established: renderer removal saves little; Main is the giant.)

---

## Method

`scripts/spike-main-heap-profile.mjs` — launches the **built** app with the Node inspector
attached to MAIN (`electron --inspect=9878 .`), collects authoritative counters, then takes a V8
heap snapshot (internal GC ⇒ live set only) and aggregates self-size by constructor/type with
WASM/PGlite buckets. Raw snapshot kept outside the repo; only aggregates archived
(`p3_main_heap_profile.json`). Run at ~21 s uptime (post core init, during/just after library
lifecycle init).

## Headline result

| Counter | Value | Meaning |
|---|---:|---|
| `memoryUsage().rss` | 672.9 MB | total resident at snapshot time (inspector-inflated) |
| `memoryUsage().heapUsed` | **87.8 MB** | actual JS objects on V8 heap |
| `memoryUsage().external` | **197.3 MB** | outside-V8-heap buffers/WASM accounting |
| Heap-snapshot live graph | **≈ 368 MB** | full retained self-size total |

### The smoking gun

| Snapshot entry | Self-size |
|---|---:|
| **`system / JSArrayBufferData`** | **281.5 MB** |
| `system / Managed<wasm::NativeModule>` | 12.2 MB |
| object elements + properties backing stores | ~29 MB |
| everything else (code, closures, strings, GC roots…) | < 45 MB combined |

A **single ~281 MB `JSArrayBufferData`** — the classic signature of a **WASM linear memory** —
dominates the entire live graph, alongside compiled-WASM module overhead. In this codebase the
only WASM of that scale is **PGlite's `postgres.wasm`**: the entire Postgres engine running
in-process, whose linear memory grows to accommodate the database/pages and characteristically
does not shrink back.

## Answering the reviewer's numbered plan

1. **Profile composition first** → done. It is *not* distributed across services/caches/watchers;
   one WASM buffer ≈ **76% of the live graph** (281 of 368 MB). Real JS data structures are
   minor (top ordinary entries are 1–6 MB each).
2. **PGlite-specific verdict:** CONFIRMED as the primary lever. ~280 MB lives inside PGlite's
   WASM heap regardless of row counts at this scale. Notably, Node 24 in this Electron
   (`versions.sqlite: 3.51.3`) ships a built-in native `node:sqlite` — meaning a SQLite path
   could exist **without any new native dependency**, if a migration is ever chosen. (Recorded
   strictly as a measured-backed hypothesis; migration itself was never the objective.)
3. **"Memory that shouldn't be resident":** nothing else in the graph qualifies as anomalous —
   no runaway caches or duplicated song arrays visible at snapshot granularity. The floor after
   removing PGlite would be roughly: ~88 MB JS heap + ~80–120 MB V8/Electron/Node/code baseline
   (exact baseline needs one more experiment: same snapshot on a build with the DB layer stubbed).
4. **Mini suspension design implication:** because the cost is a WASM heap owned by Main,
   suspending UI/renderers changes nothing (Phase 2 proved this); any real reduction must either
   (a) move persistence out of the WASM heap (SQLite/native) or (b) move DB ownership into a
   separate process that can be released when Mini-only.

## Caveats (honesty)

- Single run, ~21 s uptime, inspector attached (adds some overhead; RSS here 673 MB vs the 457 MB
  OS-sampled steady state from Phase 2 — treat *ratios/composition* as the finding, absolute RSS
  as environment-dependent).
- `external` (197 MB) vs snapshot ArrayBuffer size (281 MB) differ by accounting domain; both
  independently identify the same oversized buffer.
- Attribution "JSArrayBufferData = PGlite" is inference from exclusivity (no other WASM consumer
  exists in the dependency set) + the accompanying `Managed<wasm::NativeModule>`; a confirming
  A/B (stubbed DB build) would make it bulletproof if this ever proceeds.

## Recommended next gate (if RAM work continues)

One decisive A/B experiment before ANY migration talk: build with the database layer swapped to
`node:sqlite` behind the existing Drizzle interface for read paths only, re-measure Main Private.
Expected outcome bands: ≥150 MB saved → migration conversation is real; <50 MB saved → stop here.

## Artifacts

`p3_main_heap_profile.json` · `spike-main-heap-profile.mjs`
