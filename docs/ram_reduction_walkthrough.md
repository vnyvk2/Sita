# Walkthrough: Nora Forensic RAM Validation & Test Branch Porting

## 1. Executive Summary
- Forensic validation (Phases 1–14) has been completed in the isolated worktree (`c:\Users\VINAY\intellije-workspace\Nora-ram-opt`).
- As instructed by the user, **master branch is 100% untouched**.
- A dedicated test branch `test/ram-optimization-pilot` has been created in `c:\Users\VINAY\intellije-workspace\Nora` to test the vetted optimizations.
- The v1 report claims were audited and corrected: ~65% of the claimed savings was harness artifact (uncollected Oilpan garbage due to missing GC on Control).
- The genuine, defensible net win is **−155 MB Total Working Set (−17.7%)** and **−80 MB Private Memory (−13.5%)**.

---

## 2. Experimental Verification Results

### 2.1 The Three-Metric Reality
1. **Total Working Set:** `722.97 MB` (down from 877.94 MB Control; 500–600 MB Total WS missed by ~123 MB due to base engine constraints).
2. **Total Private Memory:** `513.48 MB` (down from 593.51 MB Control; **in target zone**).
3. **App-Attributable Memory:** `434.99 MB` (after subtracting the irreducible **287.98 MB Empty Electron App Floor**).

### 2.2 Scroll Disambiguation ($N=5$ Standardized Reps)
- **LOO-G (With V8 Cap 256MB):** FPS: `38.1`, p50: `16.7 ms`, p95: `33.3 ms`, p99: `350.2 ms`.
- **LOO-H (Uncapped):** FPS: `40.8`, p50: `16.7 ms`, p95: `18.1 ms`, p99: `250.0 ms`.
- **Result:** `--max-old-space-size=256` manufactured an 84% jump in p95 latency and +100ms in p99 latency without saving steady-state RAM. **DROPPED.**

### 2.3 HTMLAudioElement Clock-Path Contention
- Media element `currentTime` vs wall clock under heavy libvips/sharp thumbnail generation:
  - Control (Out-of-Process): 0 stalls, 21ms drift, 132ms stress duration.
  - In-Process Audio: 0 stalls, 21ms drift, 70ms stress duration.
  - Eliminating the separate `audio.mojom.AudioService` utility process safely saves **~85 MB Utility WS** with **zero audio stalls**.

### 2.4 60-Second Backgrounded Minimize Purge
- Baseline memory before minimize: **852 MB**.
- After 60s minimized: **734 MB** (**118 MB reclaimed** via `PurgeRendererMemoryWhenBackgrounded`).
- Audio played continuously through the 60s minimize with **0 stalls**, and app restored cleanly.

---

## 3. Applied Changes on `test/ram-optimization-pilot`
1. `src/main/main.ts`:
   - `disable-features: SpareRendererForSitePerProcess,AudioServiceOutOfProcess`
   - `enable-features: PurgeRendererMemoryWhenBackgrounded`
2. `src/main/db/sqlite/engine.ts`:
   - `PRAGMA cache_size = -4000;`
3. `src/main/other/artworks.ts` & `src/main/thumbnails/thumbnailService.ts`:
   - `sharp.cache({ memory: 10, files: 10, items: 20 });`
   - `sharp.concurrency(1);`
4. `src/main/workers/process/MediaWorkerBridge.ts`:
   - `DEFAULT_IDLE_SHUTDOWN_MS = 25_000`, `IDLE_CHECK_INTERVAL_MS = 10_000`, active resolvers check before terminate.
5. `src/renderer/src/components/LyricsPage/LyricsAmbientBackground.tsx`:
   - Blur factor reduction, `contain: 'strict'`, pass `thumbnail` prop.
6. `src/renderer/src/queryClient.ts`:
   - `gcTime: 1000 * 60 * 2`.
7. `docs/forensic_validation_report.md` & `docs/walkthrough.md`:
   - Persisted in repo for permanent reference.
