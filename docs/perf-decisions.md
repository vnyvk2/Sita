# Performance & Architectural Decision Ledger — Nora

This ledger records binding performance and virtualization architecture decisions. Each entry documents the problem date, the chosen tradeoff, measured receipts, rejected alternatives, and the exact reversal trigger.

---

## 1. Virtualized List Scroll-Seek Configuration (`scrollSeekConfiguration`)

- **Date:** 2026-09-08 (Root Analysis & Stabilization) / 2026-10-07 (Permanent Armor)
- **Decision:** Do NOT set `scrollSeekConfiguration = false`. Maintain `enter: > 2500 px/s` and `exit: < 300 px/s` with a calm, geometry-matched skeleton placeholder (`SongRowSkeleton` with `slotColor`).
- **Reason:** Disabling seek placeholders causes rapid flings to synchronously mount 30–45 heavy React component trees per frame across large libraries (50k songs), spiking `jank > 33ms` from 15.4% to 25.4% (measured in `docs/PERFORMANCE_WORKLOG.md` L105). Setting enter velocity to 800 px/s caused normal mouse wheel scrolls to blank the viewport. The calm slot-colored placeholder eliminates the visual double-swap defect without dropping frames.
- **Rejected Alternatives:**
  - `scrollSeekConfiguration = false`: Caused severe fling frame drops in production benchmarks.
  - Transparent empty div placeholder: Caused the jarring "blank screen -> skeleton shimmer restart -> real row" flash.
- **Reversal Trigger:** Only if `react-virtuoso` implements native concurrent scheduling or offscreen canvas painting that eliminates the synchronous DOM mounting stall without seek placeholders.

---

## 2. Eager Artwork Loading on Virtualized Song Rows (`loading="eager"`)

- **Date:** 2026-10-07
- **Decision:** Song rows do NOT use `loading="lazy"`. Virtualized rows load artwork eagerly (`loading` attribute omitted or set to eager), combined with `decoding="async"` and decode-then-reveal synchronization.
- **Reason:** Virtualization already gates DOM mounts to the visible viewport plus a small pre-mount margin (`DEFAULT_LIST_OVERSCAN`). Adding `loading="lazy"` introduces a second, uncontrolled Chromium-level deferral that leaves art slots blank even after the row is mounted and stationary. With content-addressed immutable HTTP caching, repeated fetches are 0ms in-memory cache hits.
- **Scope:** Restricted to virtualized list rows (`StandardSongRow.tsx`, `SmallSongRow.tsx`). Non-virtualized pages (`AlbumsPage`, `QueueContainer`) retain `loading="lazy"`.
- **Reversal Trigger:** If cold tab initialization spikes concurrent IPC asset requests beyond manageable OS socket boundaries (>150 concurrent unthrottled requests).

---

## 3. Content-Addressed Immutable Cache Headers (`handleFileProtocol.ts`)

- **Date:** 2026-10-07
- **Decision:** Serve `public, max-age=31536000, immutable` strictly for `sha256`-named artwork files (`<sha256>[-optimized].webp` inside `song_covers/`). Maintain ETag revalidation for bundled defaults (`default-*`) and on-demand thumbnails (`nora://thumb/`).
- **Reason:** SHA-256 filenames are mathematically content-addressed (the URL *is* the content). A deleted and regenerated artwork file with identical contents writes the exact same hash filename. Setting `immutable` instructs Chromium to completely bypass the IPC revalidation round-trip on repeat visits during scrolling.
- **Reversal Trigger:** If artwork storage is refactored to allow in-place file mutation under unchanged filenames without changing the hash.

---

## 4. Always-Painted Art Slot (`artSlotColor`)

- **Date:** 2026-10-07
- **Decision:** Every song row mounts with an always-painted, deterministic background color calculated via pure hash function `artSlotColor(songId)`.
- **Reason:** Eliminates the transparent art slot gap during the 30–80ms window while thumbnail bytes are read and decoded. The photo crossfades in smoothly over a stable colored card with zero layout shift and zero remounting.
- **Rejected Alternatives:**
  - SQL relational join on `palette.swatches`: Ruled out because joining palette data across 50,000 library rows severely inflates query payloads and breaks fast O(1) list hydration (`paletteData: undefined` is deliberate).
- **Reversal Trigger:** If per-row palette swatches ever become available synchronously without SQL join or IPC cost; if the hash hue reads as visually jarring, desaturate towards neutral card tones.

---

## 5. Disabled Image Fade-Ins in Virtualized Rows (`enableImgFadeIns={false}`)

- **Date:** 2024-05-04 (Commit `4b5c90aa`) / Confirmed 2026-10-07
- **Decision:** Virtualized song rows pass `enableImgFadeIns={false}` to `<Img>`. Decode-then-reveal transitions are handled via `revealOnDecode`.
- **Reason:** CSS delayed fade-ins (`delay-[250ms]`) clash with Virtuoso's aggressive element recycling, causing delayed visual pop-ins long after rows have already scrolled into view.
- **Reversal Trigger:** Never for virtualized lists. Delay timers belong only on static hero banners or standalone album modals.

---

## 6. Scroll-Adaptive Paint Suppression (`.is-scrolling`)

- **Date:** 2026-08-31 (Commit `fd740936`)
- **Decision:** Maintain `.is-scrolling` on scroller containers with `MIN_HOLD_MS = 400` and `SCROLL_IDLE_MS = 150`.
- **Reason:** Suppresses `pointer-events`, CSS transitions, `backdrop-filter`, and `box-shadow` during active scrolling to maximize framerate.
- **Important Invariant:** `.is-scrolling` does NOT hide images, modify opacity, or alter element visibility. During scrolling, transitions cut instantaneously rather than fading.
- **Reversal Trigger:** If Chromium compositing makes backdrop-filter layerization completely zero-cost across 80+ simultaneous surfaces.

---

## 7. Stable Item Keys (`computeSongItemKey`)

- **Date:** 2026-10-07
- **Decision:** Virtuoso item keys MUST be strictly the numeric `songId` (`filteredSongIds[index] ?? index`).
- **Reason:** Sharing stable item keys between `SongRowSkeleton` and `Song` allows React to perform an in-place reconciliation swap rather than a full unmount/mount. Keying on hydration state or window stage forces component destruction, resets `<Img>` decode state, and creates jarring double-frame flashes.
- **Reversal Trigger:** Never. Stable entity identity is a core React virtualization requirement.

---

## 8. Dual Artwork Table Split (50×50 Optimized Thumbnails)

- **Date:** 2026-09-03
- **Decision:** The library pre-generates 50×50 WebP thumbnails (~1 KB) during initial scanning. Songs list rows consume `optimizedArtworkPath` exclusively. Full-resolution originals are reserved for Now Playing, Album Details, and Fullscreen views.
- **Reason:** Prevents virtualized rows from decoding 1000×1000 original artwork images (~4 MB bitmap in memory per image), bounding memory usage to ~1 KB per row.
- **Reversal Trigger:** If high-DPI row densities require a 100×100 variant, introduce an intermediate size rather than reverting to full-resolution originals.
