# 02. System-Wide Dependency Rules & Ownership Graph

This document details the cross-layer dependency invariants (allowed vs. forbidden calls) and structural ownership hierarchies governing the entire Nora architecture.

---

## 1. System-Wide Allowed vs. Forbidden Layer Matrix

```mermaid
graph TD
    subgraph Layers ["Layer Hierarchy (Top to Bottom)"]
        Pres[Presentation Tier / React Renderer]
        Bridge[Preload Bridge / IPC Handlers]
        Apps[Application Services / Coordinators]
        Engines[Domain Engines / State Managers]
        Infra[Infrastructure / Schedulers / Adapters]
        Storage[Storage / Repositories / SQLite / File System]
    end

    Pres -->|ALLOWED| Bridge
    Bridge -->|ALLOWED| Apps
    Bridge -->|ALLOWED| Engines
    Apps -->|ALLOWED| Engines
    Apps -->|ALLOWED| Infra
    Engines -->|ALLOWED| Storage
    Engines -->|ALLOWED| Infra
    Infra -->|ALLOWED| Storage

    Pres x-- FORBIDDEN --x Apps
    Pres x-- FORBIDDEN --x Storage
    Bridge x-- FORBIDDEN --x Storage
    Infra x-- FORBIDDEN --x Apps
    Storage x-- FORBIDDEN --x Engines

    style Pres fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
    style Bridge fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style Apps fill:#d5e8d4,stroke:#82b366,stroke-width:2px
    style Engines fill:#dae8fc,stroke:#6c8ebf,stroke-width:2px
    style Infra fill:#f8cecc,stroke:#b85450,stroke-width:2px
    style Storage fill:#fff8e1,stroke:#ffa000,stroke-width:2px
```

---

## 2. Invariant Forbidden Rules Summary

| Source Subsystem | Forbidden Target | Architectural Rationale |
|---|---|---|
| **Presentation Tier (React UI)** | Any SQLite Repository or Node `fs` API | Presentation code runs in sandboxed Chromium renderer. Direct SQLite or disk access breaks security sandbox and introduces data race conditions. Calls must route through typed IPC channels. |
| **Data Provider Adapters (`MusicBrainz`, `Discogs`, `CAA`)** | Storage Repositories or SQLite Database | Provider adapters are 100% read-only remote translators. Direct DB mutation from an adapter violates single metadata authority and makes transaction rollback impossible. |
| **Transaction Coordinators (`MetadataTransactionManager`)** | Resolution Managers or Remote API Gateways | Transaction managers coordinate writes; they never perform search or candidate resolution queries. Query logic is strictly separated from mutation logic. |
| **Repositories (`PlaylistRepository`, `DatabaseMetadataRepository`)** | Application Engines or Business Rules | Repositories execute raw SQL and map database records. They must remain stateless and free of domain calculations, undo logic, or AST evaluations. |
| **Playback Queue Subsystem (`QueueEngine`)** | Operation Framework Journal (`operation_journal`) | Playback state (shuffle, cursor, upcoming tracks) is ephemeral and in-memory. Playback queues do not pollute the persistent collections undo journal. |
| **Search Subsystem (`SearchCoordinator`)** | Direct SQLite Writes / Tag Mutation Services | Search is 100% read-only. Search engines discover references (`SearchMatchReference`) and hydrate DTOs without mutating domain state. |

---

## 3. Structural Ownership & Lifetime Hierarchies

Ownership defines lifecycle parentage (which entity creates, initializes, and holds references to child objects):

```mermaid
graph TD
    subgraph MainRoot ["Main Composition Roots"]
        InitIPC[initializeIPC]
        MetaBoot[MetadataBootstrap]
        CollBoot[collections/setup]
    end

    subgraph LibraryOwners ["Library Subsystem Ownership"]
        InitIPC ==> Lifecycle(LibraryLifecycleController)
        Lifecycle ==> Scanner(LibraryScanner)
        Scanner ==> Reconciler(LibraryReconciler)
        InitIPC ==> Scheduler[/JobScheduler/]
        Scheduler ==> Workers[/Asset Workers/]
    end

    subgraph MetadataOwners ["Metadata Subsystem Ownership"]
        MetaBoot ==> MetaContainer[MetadataContainer]
        MetaContainer ==> ResMgr(MetadataResolutionManager)
        MetaContainer ==> TxMgr(MetadataTransactionManager)
        ResMgr ==> LookupGW(DefaultMetadataLookupGateway)
        LookupGW ==> ProvExec(MetadataProviderExecutor)
        ProvExec ==> ResReg{ResolutionProviderRegistry}
        TxMgr ==> MutExec(MutationExecutor)
        MutExec ==> TagWriter(TagWriterService)
        MutExec ==> DBSync[(LibraryRelationalSyncService)]
    end

    subgraph CollectionsOwners ["Collections Subsystem Ownership"]
        CollBoot ==> PlEngine(PlaylistEngine)
        CollBoot ==> UndoEng(UndoEngine)
        PlEngine ==> OpExec(OperationExecutor)
        PlEngine ==> Hierarchy(HierarchyService)
        PlEngine ==> FolderStats(FolderStatisticsService)
    end

    subgraph QueueOwners ["Queue Subsystem Ownership"]
        InitIPC ==> QEngine(QueueEngine)
    end

    style MainRoot fill:#f5f5f5,stroke:#999999
    style LibraryOwners fill:#dae8fc,stroke:#6c8ebf
    style MetadataOwners fill:#ffe6cc,stroke:#d79b00
    style CollectionsOwners fill:#e1d5e7,stroke:#9673a6
    style QueueOwners fill:#d5e8d4,stroke:#82b366
```
