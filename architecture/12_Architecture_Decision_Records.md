# 12. Architecture Decision Records (ADR Master Log)

This document records the foundational architectural decisions, problem contexts, design choices, and system-wide consequences governing the entire Nora Music Player codebase.

---

## ADR-001: `MetadataEngine` is the Single Metadata Authority

- **Status**: Accepted
- **Context**: Early metadata query paths were fragmented across multiple ad-hoc services, leading to inconsistent cache states and race conditions.
- **Decision**: Establish `MetadataEngine` as the single internal authority for metadata entity state, identity resolution, and cache invalidation.
- **Consequences**: All internal entity read/write queries route through `MetadataEngine`; direct database table queries outside repositories are forbidden.

---

## ADR-002: Provider Resilience Isolation via `MetadataProviderExecutor`

- **Status**: Accepted
- **Context**: Direct HTTP calls to MusicBrainz, Discogs, and Cover Art Archive risked unhandled rate-limit failures (HTTP 429) and network timeouts blocking the main Electron thread.
- **Decision**: Enforce 100% routing of external provider calls through `MetadataProviderExecutor`, wrapping requests in Circuit Breakers, Rate Limiters (1 req/sec), Retry Policies, and Timeout Policies.
- **Consequences**: External outages or rate limits are safely intercepted without crashing application UI; provider diagnostics are centrally logged.

---

## ADR-003: `MetadataTransactionManager` Owns All File & DB Writes (Option A Rollback)

- **Status**: Accepted
- **Context**: File tagging and database state updates were previously scattered across IPC handlers and application services, making rollback on write failure impossible.
- **Decision**: Centralize all write operations under `MetadataTransactionManager` as the transaction coordinator, enforcing Option A (whole-transaction atomic all-or-nothing) rollback semantics with reverse snapshot playback.
- **Consequences**: Write failures or cancellation mid-transaction automatically revert disk files and SQLite database records to pre-transaction states.

---

## ADR-004: Single Composition Root via `MetadataBootstrap` & `collections/setup`

- **Status**: Accepted
- **Context**: Ad-hoc service instantiation inside `ipc.ts` caused duplicated networking pipelines, multiple rate limiters, and untraceable lifecycle ownership.
- **Decision**: Consolidate all service construction and dependency injection inside dedicated composition roots (`MetadataBootstrap`, `collections/setup.ts`, `initializeIPC`).
- **Consequences**: `ipc.ts` performs 0 service constructions; dependencies are cleanly injected into structured container namespaces (`application`, `resolution`, `transactions`, `infrastructure`).

---

## ADR-005: Field-Based Query Intent Over Provider-Specific APIs

- **Status**: Accepted
- **Context**: AutoTag searches previously bound UI workflows directly to provider-specific endpoints (`searchMusicBrainz Releases`).
- **Decision**: Shift to field-based resolution intent (`resolve(fields: title, artist, album, genre, artworkUrl)`).
- **Consequences**: AutoTag workflows operate on abstract field metadata intents, allowing multi-provider federation (MusicBrainz for track structure, Discogs for genres/styles, Cover Art Archive for artwork) seamlessly.

---

## ADR-006: Asynchronous Non-Blocking Library Builder & Asset `JobScheduler`

- **Status**: Accepted
- **Context**: Legacy synchronous scanning blocked the UI for minutes on large libraries (100k+ tracks) while resizing artwork and generating palettes synchronously.
- **Decision**: Decouple metadata ingestion from derived asset creation. The library becomes immediately usable upon metadata commit, while artwork, palettes, waveforms, and lyrics process in the background via a 3-tier `JobScheduler`.
- **Consequences**: Library scan times reduced by 95%; derived assets generate smoothly without UI frame drops.

---

## ADR-007: Pure In-Memory Snapshot Diff Engine with Root-Scoped Safety

- **Status**: Accepted
- **Context**: Checking file modifications by querying the database in a loop during directory traversal caused disk thrashing and dangerous mass-deletion bugs if external drives were disconnected.
- **Decision**: Implement a pure in-memory `diffFilesystemSnapshot` engine comparing disk snapshots against flat DB snapshots using a $\pm 1000\text{ms}$ mathematical tolerance rule and strict root accessibility scoping.
- **Consequences**: Disconnected drives, failed subtrees, or file permission errors never trigger accidental library removals; diffing 50,000 files takes $< 100\text{ms}$.

---

## ADR-008: Ephemeral Non-Destructive Shuffled Permutation Vector Queue Model

- **Status**: Accepted
- **Context**: Scrambling the underlying song array on shuffle destroyed the user's original playlist sequence and caused state divergence between the main process and React UI.
- **Decision**: Maintain a natural order `entries` array and map playback order using a `shufflePermutation` vector with active track anchoring at index `0`.
- **Consequences**: Toggling shuffle ON/OFF is instantaneous and 100% non-destructive; reordering a shuffled queue does not alter the underlying album sequence.

---

## ADR-009: Reversible Operation Framework & Linear Pointer-Based Journaling

- **Status**: Accepted
- **Context**: Implementing undo/redo with branching state trees created extreme complexity, memory bloat, and fragile rollback code.
- **Decision**: Require every collection mutation to implement a `CollectionOperation` with an automatic `computeInverse()` method, recording forward and inverse payloads in `operation_journal` with a linear sequence pointer.
- **Consequences**: Undo/Redo is completely decoupled from UI logic, supports unlimited linear rollbacks, and automatically supports new operations via `OperationRegistry`.

---

## ADR-010: AST-Based Smart Playlist Compilation to Parameterized SQL

- **Status**: Accepted
- **Context**: Evaluating smart playlist filters in memory required loading the entire song library into RAM on every track play.
- **Decision**: Model smart playlist rules as typed JSON ASTs compiled directly into optimized parameterized SQL queries with automatic dependency extraction.
- **Consequences**: Smart playlists evaluate in $< 5\text{ms}$ using database indexes; `SmartPlaylistScheduler` selectively invalidates only when dependent fields change.

---

## ADR-011: Unified Federated Search with Single-Pass Batched Hydration

- **Status**: Accepted
- **Context**: Running 5 separate search queries with individual entity joins caused dozens of repetitive database roundtrips per keystroke.
- **Decision**: Search engines return lightweight `SearchMatchReference[]` pointers (`kind`, `id`, `tier`), which are hydrated in a single unified batched query via `MetadataSearchGateway.hydrateReferences()`.
- **Consequences**: Search response latency dropped from $350\text{ms}$ to $< 25\text{ms}$; database query count reduced from $N+1$ to 1.

---

## ADR-012: Disposable Derived Asset Caching with Generator Versioning

- **Status**: Accepted
- **Context**: Upgrading image resizing or palette extraction algorithms previously required writing fragile database migration scripts or losing user preferences.
- **Decision**: Treat derived assets (artworks, palettes, waveforms, lyrics, replay gain) as disposable caches tracking integer `generatorVersion` columns.
- **Consequences**: Caches can be safely deleted or upgraded at any time; outdated asset versions are automatically regenerated on demand without manual migrations.

---

## ADR-013: Electron Context Isolation & Hardened IPC Whitelisting

- **Status**: Accepted
- **Context**: Exposing Node `fs` or `child_process` to the renderer posed severe security risks and broke renderer sandboxing.
- **Decision**: Enable Electron context isolation, disable `nodeIntegration`, and route all renderer interactions through an immutable, frozen `window.api` preload bridge.
- **Consequences**: Robust security sandbox; predictable, auditable communication contracts between UI and Main processes.

---

## ADR-014: Battery-Adaptive Background Worker Concurrency Throttling

- **Status**: Accepted
- **Context**: Intensive background asset building drained laptop battery life rapidly when running unplugged.
- **Decision**: Integrate Electron's `powerMonitor` with `adaptivePolicyEngine` to dynamically scale background worker limits (from 4 workers down to 1 worker and 0 maintenance jobs) when operating on battery power.
- **Consequences**: Significant battery preservation while maintaining instant UI responsiveness.
