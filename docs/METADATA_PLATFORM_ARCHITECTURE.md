# Nora Metadata Platform Architecture Specification

> **Core System Invariant**:  
> *Every metadata change in Nora is a Domain-Driven Metadata Operation executed on Metadata Resources by the Metadata Engine, regardless of where it originated.*

---

## 1. Architectural Constitution (Non-Negotiable Invariants)

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

## 2. Platform Architecture Layers

```text
Domain Layer ─────────► MetadataResource │ MetadataOperation │ MetadataPreview │ MetadataPolicy │ MetadataHealth
                                    │
                                    ▼
Application Layer ────► MetadataEngine
                         ├── MetadataOperationManager
                         ├── MetadataResolutionManager
                         ├── MetadataTransactionManager
                         └── ProviderFederation
                                    │
                                    ▼
Infrastructure Layer ─► TagWriter │ ArtworkDownloader │ DatabaseSync │ ProviderAdapters │ Filesystem
                                    │
                                    ▼
Presentation Layer ───► AlbumResolutionUI │ ManualEditUI │ BatchEditUI │ HealthDashboard
```

---

## 3. Metadata Operation Lifecycle & Transaction Pipeline

```text
MetadataOperation (Created)
       │
       ▼
Searching ─────────────► MetadataResolutionManager (Candidate Resolution via Provider Federation)
       │
       ▼
PreviewReady ──────────► MetadataPreview (Universal UI DTO with Provider Attribution)
       │
       ▼
Applying ──────────────► MetadataTransactionManager
                               │
                               ├──► ArtworkDownloaderService (Network I/O)
                               ├──► TagWriterService (Physical Disk File Write)
                               ├──► LibraryRelationalSyncService (Relational DB & reParseSong)
                               ├──► ArtworkCacheInvalidator (UI Image Cache Cleanup)
                               └──► MetadataHistoryService (UndoToken & Snapshot Recording)
       │
       ▼
Completed ─────────────► Publish Event Signals (MetadataTransactionCompleted)
```
