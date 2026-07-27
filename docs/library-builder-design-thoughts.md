# Library Builder: Architectural Design Thoughts & Evolution

This document serves as the historical record and long-term architectural specification for Nora's library importing subsystem. It chronicles the transition from a synchronous, blocking "Scanner" to an asynchronous, decoupled "Library Builder" that prioritizes instant access, low memory footprint, and fault tolerance.

---

## 1. Core Design Principles (The Constitution)

Before diving into the mechanics, we established a set of core design principles. Future contributors must preserve these principles to keep the architecture consistent over time:

1. **Metadata first.** The library becomes usable as soon as metadata is committed.
2. **Derived assets never block usability.** Artwork, palettes, and future assets are generated asynchronously in the background.
3. **The scheduler is generic.** It coordinates jobs without knowing their implementation.
4. **Every asset is resumable.** Missing derived assets can always be regenerated from source files.
5. **Derived assets are disposable.** Metadata stored in the database represents the authoritative description of the library. Derived assets (artwork caches, palettes, waveforms, etc.) are considered disposable caches. If they are deleted, corrupted, or become outdated, the scheduler regenerates them automatically from the source media.
6. **The same pipeline serves initial import and incremental updates.**
7. **Memory usage remains bounded.** Workers avoid retaining large buffers unnecessarily by relying on deterministic file re-reads.
8. **Database transactions stay short.** CPU-intensive and filesystem work are performed outside transactions.

---

## 2. Source of Truth

The most critical property of this architecture is the strict separation between authoritative data and disposable data.

```text
Filesystem
      │
      ▼
Metadata Database
      │
      ▼
Derived Assets
```

The media files on the filesystem and the extracted text in the metadata database together represent the authoritative state of the library. Everything downstream (artwork, palettes, waveforms) are simply caches. This unlocks the ability to clear caches, recover from corruption, perform migrations, or rebuild the library effortlessly without losing the user's core data.

---

## 3. The Problem: The "100k Track Wall"

### The Original Architecture (Synchronous Scanning)
The original implementation (`addMusicFolder.ts` -> `parseSong.ts`) operated on a strict, synchronous pipeline. 

```text
addMusicFolder.ts
    ↓
for (...) await tryToParseSong()
    ↓
parseSong.ts
    ↓
Read taglib
    ↓
DB transaction
    ↓
storeArtworks()
    ↓
sharp
    ↓
filesystem
    ↓
DB commit
```

### Why it failed at scale
That meant one song owned the pipeline until it was completely finished. Everything waited for everything else. For 100 songs, that's okay. For 2,000 songs, it starts hurting. For 100,000 songs, it becomes an impenetrable bottleneck.

The problem wasn't TagLib. The problem wasn't Sharp. The problem was **pipeline coupling**. Holding a database transaction open during expensive CPU and I/O work creates a massive architectural smell.

---

## 4. The Mental Model Shift: "Library Builder"

We fundamentally shifted the philosophy of the subsystem. We stopped thinking about it as "Scanning" and started thinking about it as "Building Assets."

**Old Way:**
```text
Scan
  ↓
Everything
  ↓
Done
```

**New Way (The Library Builder):**
```text
Build Library
  ↓
Generate Derived Assets
  ↓
Continuously Enrich Library
```

By decoupling the metadata parser from the artwork extractor, we achieved the following healthy transaction flow:

```text
Read tag -> Extract metadata -> DB commit -> Library Immediately Usable ✅ -> Queue artwork for later
```

---

## 5. The Generic Job Scheduler & Asset Abstraction

We explicitly moved away from the idea of an "Artwork Queue" or even a "Background Asset Queue". We abstracted one level further to a pure **`JobScheduler`**.

**The scheduler is the single authority responsible for all background derived-asset processing.** This prevents future contributors from accidentally spinning up rogue `WaveformQueue` or `LyricsQueue` systems outside of the central orchestration layer.

### Scheduler Responsibilities (What it MUST NEVER do)
To prevent architectural drift, the strict separation of concerns is explicitly defined.
The scheduler **never**:
- Parses metadata
- Compresses artwork
- Manipulates UI
- Performs business logic

It **only**:
- Schedules
- Prioritizes
- Retries
- Cancels
- Tracks state

In this architecture, `ArtworkJob`, `PaletteJob`, and future jobs (like `WaveformJob`, `LyricsJob`, `ReplayGainJob`) are merely plugins. The scheduler knows nothing about artwork. It only knows about standard interfaces: `id`, `type`, `priority`, `state`, `dependencies`, `execute()`, `retry()`, and `cancel()`.

### The Subsystem Architecture
This diagram explains the entire architecture of the Library Builder at a glance:

```text
Filesystem
      │
      ▼
 Metadata
      │
      ▼
 Database
      │
      ▼
 Scheduler
 ┌────┼────┬────┐
 ▼    ▼    ▼    ▼
Art Wave Lyrics ReplayGain
 │
 ▼
Palette
```

---

## 6. Key Architectural Decisions

We debated several edge cases and optimizations to ensure this system was truly enterprise-grade.

### A. High / Normal Priority (Avoiding Queue Churn)
To make the UI feel instantly responsive, artwork must generate immediately if the user scrolls to an album. However, we explicitly avoided a system that reshuffles or reorders a single queue (e.g., `queue.unshift()`), as that leads to priority inversion, race conditions, and duplicate requests.
Instead, we use two deterministic queues: `High Priority` and `Normal Priority`. The worker always checks High Priority first. If a user scrolls to an album, its job simply gets enqueued into High Priority.

### B. Album-Level Artwork (With Caveats)
Under the old system, a 12-track album resulted in 12 identical artwork extractions. The new design prioritizes **Albums** over songs. By default, the first successfully processed artwork becomes the album artwork. 
*Architectural Caveat:* The data model remains `Artwork Asset -> Referenced by Album(s)`. This leaves room for edge cases like deluxe editions, bonus discs, or inconsistent tags where songs in the same album might genuinely have different artwork.

### C. Explicit Job States, IPC, & Failure Policies
Jobs do not just exist in RAM. They have an explicit lifecycle:
`Queued -> Running -> Completed -> Failed -> Cancelled`
- **Retries:** Retries use a configurable retry policy with a sensible default (e.g., 3 retries). Someone may later decide to adjust this without changing the architecture.
- **Failures:** Failure to generate a derived asset never invalidates successfully imported metadata.
- **IPC:** Jobs communicate completion through events (e.g. `ARTWORK_READY`) rather than direct UI manipulation.

### D. Duplicate Job Protection
If a user rapidly scrolls past "Dark Side of the Moon" multiple times, we must prevent the UI from spawning duplicate jobs. The scheduler explicitly rejects duplicate queued or running jobs by ID. **Only one active job may exist per asset ID.**

### E. Memory Bounded by Design
Instead of keeping 100,000 extracted image buffers in RAM while waiting for the background queue to process them, the queue payload is kept tiny: `{ albumId, sampleSongPath }`. The worker reopens and re-reads the file from disk when it's ready. We traded a small disk read for a massive, predictable reduction in RAM bloat.

### F. Configurable Concurrency
Concurrency limits may be tuned independently for different job types. For example:
- Metadata: 16 workers
- Artwork: 4 workers
- Waveforms: 2 workers

### G. Watcher Integration
This pipeline is not just for the initial import. Incremental filesystem updates (e.g., adding a single new track via a filesystem watcher) reuse the **exact same scheduler and pipeline**. This prevents the nightmare of maintaining two separate parsing pipelines.

### H. Cancellation & Crash Recovery
- **Cancellation:** The scheduler relies on Cancel Tokens. If a user clicks "Cancel Import" or removes a folder, workers finish their current job and the remaining jobs are discarded safely.
- **Crash Recovery (Queue Persistence):** Queue state is intentionally **not persisted** to disk. The scheduler simply reconstructs pending work on startup by inspecting missing derived assets in the database (e.g., "Find Albums where artworkId is NULL").

---

## 7. User Experience & UI Refinements

### Granular Progress Tracking
Instead of a vague "Scanning 72%", progress is broken into stages based on **jobs processed**, not songs processed. Each pipeline reports progress relative to its own workload:
- **Music:** ██████████ 100%
- **Artwork:** █████░░░░ 54%
- **Palettes:** ██░░░░░░░ 18%

### The Placeholder Pipeline
Dumping the user into a sea of ugly grey boxes betrays Nora's premium feel. Instead, the UI handles missing artwork gracefully:
1. Show a neutral gradient + Music note icon.
2. `ARTWORK_READY` IPC event fires.
3. Use an animated transition to reveal the new Artwork and dynamic Palette.

---

## 8. Advanced Extensibility & Evolution (Future Roadmap)

To future-proof the architecture, the following advanced systems engineering concepts are documented as logical extensions of the core design.

### A. Content-Addressable Derived Assets (Global Deduplication)
Derived assets may eventually be stored using content hashes (e.g., `SHA-256(image bytes)`) instead of entity identifiers like `albumId`. 
This shifts the model to `Artwork Asset <- Referenced by -> Album(s)`. If 50 compilation albums share the exact same generic embedded cover art, it is only stored on disk **once**. This guarantees global deduplication, reduces disk usage, and simplifies cache invalidation.

### B. Cache Lifecycle (Garbage Collection)
Because derived assets are disposable caches, they require a defined lifecycle: `Generate -> Reference -> Dereference -> Collect`. 
A periodic, low-priority Garbage Collection process sweeps the database for unreferenced assets (e.g., after an album is deleted) and physically removes the files to prevent cache bloat over years of usage.

### C. Event-Driven Choreography
Plugins should never have direct dependencies on one another. Jobs communicate exclusively through generic scheduler events (e.g., `JOB_COMPLETED`, `ASSET_CREATED`, `ASSET_UPDATED`, `ASSET_DELETED`).
For example: `ASSET_CREATED` fires -> Palette Plugin subscribes and queues a job -> Thumbnail Plugin subscribes and queues a job. This guarantees 100% decoupling.

### D. Adaptive Scheduling
Execution policies may adapt dynamically based on runtime conditions (e.g., hardware capabilities, system load, user activity, or battery power state) without requiring any changes to the scheduler architecture itself.

### E. Versioned Derived Assets
Generators evolve (e.g., upgrading to Palette Algorithm V2). Instead of writing complex migration scripts, derived assets track their Generator Version. If the scheduler detects that the stored version (v1.0) is older than the current engine version (v2.0), the asset is automatically marked obsolete and regenerated seamlessly.

### F. Operational Metrics
The scheduler exposes architectural metrics (e.g., `Jobs/sec`, `Queue depth`, `Failures`, `Retries`, `Latency`). These operational metrics are invaluable for performance tuning and benchmarking.

---

## Final Verdict
This architecture follows the asynchronous asset-processing patterns used in large-scale media servers. It comfortably supports libraries ranging from a few hundred tracks to hundreds of thousands while remaining infinitely extensible for future features without ever needing another foundational redesign.
