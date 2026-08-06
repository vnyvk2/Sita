# Phase 13 — Unified Metadata Operations Platform Specification & Status

---

## 1. Vision & Core Motivation

Prior to Phase 13, Nora's metadata operations were fragmented. The Auto-Tag feature functioned as an isolated prototype constructing standalone provider instances directly in IPC handlers, bypassing the bootstrapped `MetadataEngine`.

Phase 13 establishes the **Metadata Platform** where every metadata change—manual editing, album resolution, track resolution, batch editing, background enrichment, artwork replacement, user overrides, and future providers—is a Domain-Driven `MetadataOperation` executed by the `MetadataEngine`.

> **Core System Invariant**:  
> *Every metadata change in Nora is a Domain-Driven Metadata Operation executed on Metadata Resources by the Metadata Engine, regardless of where it originated.*

---

## 2. Architectural Invariants ("The Constitution")

1. **`MetadataEngine` is the sole metadata authority.** No subsystem may bypass `MetadataEngine`.
2. **Every metadata mutation is a `MetadataOperation`.** No direct file or database writes exist outside an operation.
3. **Operations act on `MetadataResource` entities.** (`track`, `album`, `artist`, `release`, `artwork`, `genre`).
4. **Every operation produces a `MetadataPreview` before mutation** (except approved background tasks).
5. **Every mutation executes through `MetadataTransactionManager`.**
6. **Every provider participates through Provider Federation.** No direct third-party API calls exist outside provider adapters.
7. **No provider-specific logic exists in the UI.** Presentation components consume normalized domain models.
8. **No subsystem performs metadata writes directly.** All physical ID3 tag writes flow through `TagWriterService`.
9. **Undo history is transaction-based.** Rollbacks are executed deterministically using immutable `UndoToken` snapshots.
10. **Provider policies are declarative, never hardcoded.** Hierarchy rules dictate provider priority, merging, and fallbacks.
11. **Application services orchestrate; infrastructure services perform I/O.** Application managers (`OperationManager`, `ResolutionManager`, `TransactionManager`) never perform raw `fetch()`, `fs.write()`, or direct DB queries directly.
12. **Strict single direction of dependency.** (`Domain` $\longleftarrow$ `Application` $\longleftarrow$ `Infrastructure` $\longleftarrow$ `Presentation`).

---

## 3. Implementation Status Delineation

### 3.1 Implemented & Verified Components

#### Domain Layer (`src/main/metadata/domain/`)
* **`MetadataResource.ts`**: Immutable domain resource entities (`TrackResource`, `AlbumResource`, `ArtistResource`).
* **`MetadataOperation.ts`**: Domain model capturing operation identity, type, execution mode, target resource IDs, state machine (`Created` $\rightarrow$ `Searching` $\rightarrow$ `Resolving` $\rightarrow$ `PreviewReady` $\rightarrow$ `Applying` $\rightarrow$ `Completed`), and embedded `MetadataContext`.
* **`MetadataContext.ts`**: Immutable domain context structured into sub-contexts:
  * `ResourceContext` (Primary resource type & target resources).
  * `ExecutionContext` (Execution mode, timeout, locale).
  * `SelectionContext` (Provider preferences & user selection overrides).
  * `QueryContext` (Strongly typed `AlbumLookupQuery`, `TrackLookupQuery`, `ArtistLookupQuery`, `ArtworkLookupQuery`).
  * `MetadataRequest` (Lookup query parameter encapsulation).
* **`MetadataPreview.ts`**: Universal metadata preview model containing `FieldChange`, `ProviderAttribution`, `OperationWarning`, `OperationConflict`, and resource selection.
* **`MetadataTransaction.ts` & `UndoToken.ts`**: Transaction execution contract and immutable snapshot reference models with structured `FieldMutation[]` (`fieldId`, `oldValue`, `newValue`, `providerId`, `confidenceScore`).
* **`ProviderAttribution.ts`**: Field-level provider source attribution contract (`providerId`, `providerName`, `confidenceScore`, `sourceUrl`).
* **`MetadataPolicy.ts`**: Declarative policy suite (`SelectionPolicy`, `MergePolicy`, `FallbackPolicy`, `ValidationPolicy`).
* **`MetadataHealth.ts`**: Generic quality assessment contract (`score`, `rating`, `issues`).

#### Application Layer (`src/main/metadata/resolution/` & `src/main/metadata/operations/`)
* **`MetadataLookupGateway.ts`**: Interface and default implementation wrapping candidate lookups directly.
* **`MetadataResolutionManager.ts`**: Candidate resolution manager consuming `MetadataLookupGateway` and `MetadataContext`. Throws explicit `ResolutionUnavailableError` if infrastructure is missing.
* **`MetadataOperationManager.ts`**: Application service managing operation lifecycles, state transitions, and event subscriptions without Node `EventEmitter` coupling.

---

### 3.2 Planned Work (Phases 13C – 13E)

* **Phase 13C — Unified Transaction Manager & Apply Pipeline**:
  - Build `MetadataTransactionManager` to coordinate chunked disk writes, DB re-indexing, cache flushing, and rollback snapshotting.
  - Decompose apply steps into specialized infrastructure services: `TagWriterService` (Disk I/O), `LibraryRelationalSyncService` (DB Sync), `ArtworkDownloaderService` (Network I/O), and `ArtworkCacheInvalidator` (Cache flushing).
  - Re-wire Manual Tag Editor and Album Resolution to execute through `MetadataTransactionManager`.

* **Phase 13D — Provider Federation Architecture**:
  - Connect `MetadataLookupGateway` to container-managed `ProviderFederation` (`ProviderRegistry`, `ProviderDiscovery`, `HealthManager`, `CircuitBreakerRegistry`, `DefaultProviderSelectionStrategy`, `MetadataMergeEngine`).
  - Expose provider attribution badges (`MusicBrainz`, `Discogs`, `Cover Art Archive`) in renderer preview components.

* **Phase 13E — Background Enrichment Platform & Health Dashboard**:
  - Build background enrichment job queues using `ExecutionMode.Background`.
  - Implement library metadata health scoring dashboard (`LibraryHealth`, `AlbumHealth`, `SongHealth`).

---

## 4. Automated Verification & Metrics

- **Vitest Suite**: `50 / 50 tests passed` (100% pass rate across all 13 test suites).
- **Architecture Tests**: Verified domain models and application managers via `Phase13DomainSpecification.test.ts` and `Phase13BEngineIntegration.test.ts`.
- **Zero Architectural Drift**: Zero legacy AutoTag service leaks in `MetadataOperationManager` or `MetadataResolutionManager`.
