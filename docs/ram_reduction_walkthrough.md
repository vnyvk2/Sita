# Walkthrough: Nora Forensic RAM Validation & Final Optimization

## 1. Executive Summary
- Forensic validation across dev and packaged production environments has been completed.
- **Master branch remains 100% untouched**.
- Dedicated test branch `test/ram-optimization-pilot` created in `c:\Users\VINAY\intellije-workspace\Nora` containing the vetted, production-verified optimizations.
- The v1 report claims were audited: ~65% of claimed savings was harness artifact (uncollected Oilpan garbage due to missing GC on Control).
- The genuine, defensible net win is **−155 MB Total Working Set (−17.7%)** and **−80 MB Private Memory (−13.5%)** in dev, achieving **685.97 MB Total WS / 552.64 MB Private Memory** and **57.8 FPS scrolling** in the packaged production build.

---

## 2. Experimental Verification Results

### 2.1 The Three-Metric Reality
1. **Total Working Set:** `722.97 MB` dev / `685.97 MB` prod (down from 877.94 MB Control; 500–600 MB Total WS missed by ~86–123 MB due to base engine constraints).
2. **Total Private Memory:** `513.48 MB` dev / `552.64 MB` prod (down from 593.51 MB Control; **in target zone**).
3. **App-Attributable Memory:** `434.99 MB` dev / `397.99 MB` prod (after subtracting the irreducible **287.98 MB Empty Electron App Floor**).

### 2.2 Apples-to-Apples Scroll Disambiguation ($N=5$ Standardized Reps)
- **Control Baseline:** `31.9 ± 2.6 FPS`, p50: `16.7 ms`, p95: `33.5 ms`, p99: `450.2 ms`.
- **LOO-G (With V8 Cap 256MB):** `38.1 ± 0.0 FPS`, p50: `16.7 ms`, p95: `33.3 ms`, p99: `350.2 ms`.
- **LOO-H (Uncapped):** `40.8 ± 2.3 FPS`, p50: `16.7 ms`, p95: `18.1 ms`, p99: `250.0 ms`.
- **Packaged Production Build:** `57.8 FPS`, p50: `16.7 ms`, p95: `16.8 ms`, p99: `17.2 ms`, 0 long tasks.
- **Result:** `--max-old-space-size=256` manufactured an 84% jump in p95 latency and +100ms in p99 latency without saving steady-state RAM. **DROPPED.**

### 2.3 HTMLAudioElement Clock-Path Contention
- Media element `currentTime` vs wall clock under continuous 6+ second monitoring with burst libvips/sharp thumbnail generation:
  - Control (Out-of-Process): 0 stalls, 21ms drift, 132ms query burst duration.
  - In-Process Audio: 0 stalls, 21ms drift, 70ms query burst duration.
  - Eliminating the separate `audio.mojom.AudioService` utility process safely saves **~85 MB Utility WS** with **zero audio stalls**.

### 2.4 60-Second Backgrounded Minimize Purge
- In Dev: Reclaimed **118 MB Total WS** during 60s minimize, audio played continuously for 69s with 0 stalls.
- In Packaged Production: Reclaimed **35 MB Total WS / 36.7 MB Private Memory** during 60s minimize, audio played continuously with 0 stalls, restored cleanly.

---

## 3. Final Vetted Changes on `test/ram-optimization-pilot`
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
7. `docs/`:
   - `docs/forensic_validation_report.md`
   - `docs/ram_reduction_walkthrough.md`
   - `docs/packaged_build_results.json`
