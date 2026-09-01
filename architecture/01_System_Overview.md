# 01. System Overview Architecture

This document presents the complete system topology, subsystem boundaries, and cross-cutting event flows of the Nora Music Player application.

---

## 1. High-Level System Topology

Nora is built as an Electron-based desktop application structured into three distinct execution boundaries:

```mermaid
graph TD
    subgraph RendererProcess ["Renderer Process (Chromium UI)"]
        ReactUI[React 18 / Tailwind CSS / Router]
        TanStack[TanStack Query Cache Layer]
        ZustandStore[Zustand Store / LocalStorage Syncer]
        QueuesClient[QueuesManager / PlayerQueue]
    end

    subgraph PreloadBridge ["Preload Context Bridge (Isolated IPC)"]
        ContextBridge[contextBridge.exposeInMainWorld 'api']
        IPCRenderer[ipcRenderer.invoke / ipcRenderer.send / on]
    end

    subgraph MainProcess ["Main Process (Node.js & Native Runtimes)"]
        subgraph Subsystems ["Core Domain Subsystems"]
            ScannerEngine(LibraryScanner & LifecycleController)
            QueueSubsystem(QueueEngine)
            MetaEngine(MetadataEngine & TransactionManager)
            CollectionEngine(PlaylistEngine & UndoEngine)
            SearchEngine(SearchCoordinator & SubEngines)
            JobEngine(JobScheduler & Asset Workers)
        end

        subgraph StorageLayer ["Persistence & Data Tier"]
            DrizzleDB[(SQLite / PGlite via Drizzle ORM)]
            DiskFS[(Local File System / ID3 TagLib / Sharp)]
        end
    end

    ReactUI --> TanStack
    ReactUI --> ZustandStore
    ReactUI --> QueuesClient

    TanStack --> ContextBridge
    QueuesClient --> ContextBridge
    ContextBridge --> IPCRenderer
    IPCRenderer <==>|Electron IPC Bridge| Subsystems

    Subsystems --> DrizzleDB
    Subsystems --> DiskFS

    style RendererProcess fill:#e1f5fe,stroke:#0288d1,stroke-width:2px
    style PreloadBridge fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    style MainProcess fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    style StorageLayer fill:#fff8e1,stroke:#ffa000,stroke-width:2px
```

---

## 2. Master Subsystem Interaction Map

The following composite architecture graph maps the primary collaboration pathways across all 8 major subsystems in Nora:

```mermaid
graph TD
    subgraph Pres ["Presentation Tier (Renderer UI)"]
        UI_Library[Library & Folder Views]
        UI_Player[Audio Player & Queue Views]
        UI_AutoTag[AutoTag & Metadata Modal]
        UI_Playlists[Playlists & Collections View]
        UI_Search[Global Search Bar]
    end

    subgraph IPC_Bridge ["IPC Layer (src/main/ipc.ts)"]
        IPC_Main[Main IPC Router]
        IPC_Meta[Metadata Handlers]
        IPC_Coll[Collection Handlers]
        IPC_Import[Playlist Import Handlers]
    end

    subgraph Sub_Library ["1. Library & Scanner Subsystem"]
        Lifecycle(LibraryLifecycleController)
        Scanner(LibraryScanner)
        DiffEng{diffFilesystemSnapshot}
        Reconciler(LibraryReconciler)
        Watcher[/Passive Folder Watchers/]
    end

    subgraph Sub_Queue ["2. Queue & Playback Subsystem"]
        QEngine(QueueEngine)
        QState[QueueState / Permutation Mapping]
    end

    subgraph Sub_Metadata ["3. Metadata Platform"]
        MetaEng(MetadataEngine)
        ResMgr(MetadataResolutionManager)
        ProvExec(MetadataProviderExecutor)
        TxMgr(MetadataTransactionManager)
        TagWriter(TagWriterService - TagLib)
    end

    subgraph Sub_Collections ["4. Collections & Playlists Engine"]
        PlEngine(PlaylistEngine)
        SmartPlEngine(SmartPlaylistEngine)
        UndoEng(UndoEngine)
        OpExec(OperationExecutor)
        MemCache{MembershipCache}
    end

    subgraph Sub_Search ["5. Search & Indexing Engine"]
        SearchCoord(SearchCoordinator)
        SearchHydrator{MetadataSearchGateway}
    end

    subgraph Sub_Workers ["6. Background Asset Scheduler"]
        Scheduler[/JobScheduler: Interactive, Background, Maintenance/]
        Workers[/Artwork, Palette, Waveform, Lyrics, ReplayGain Jobs/]
    end

    subgraph Sub_Storage ["7. Relational Database & Storage"]
        DB[(Drizzle SQLite Database - 24+ Tables)]
        Disk[(Physical Audio Files & ID3 Tags)]
    end

    UI_Library --> IPC_Main
    UI_Player --> IPC_Main
    UI_AutoTag --> IPC_Meta
    UI_Playlists --> IPC_Coll
    UI_Search --> IPC_Main

    IPC_Main --> Lifecycle
    IPC_Main --> QEngine
    IPC_Main --> SearchCoord
    IPC_Meta --> ResMgr
    IPC_Meta --> TxMgr
    IPC_Coll --> PlEngine
    IPC_Coll --> UndoEng

    Watcher --> Lifecycle
    Lifecycle --> Scanner
    Scanner --> DiffEng
    DiffEng --> Reconciler
    Reconciler --> DB
    Reconciler ==>|queues asset builds| Scheduler

    QEngine ==> QState

    ResMgr --> ProvExec
    TxMgr --> TagWriter
    TagWriter --> Disk
    TxMgr --> DB

    PlEngine --> OpExec
    OpExec --> DB
    OpExec --> MemCache
    UndoEng --> OpExec

    SearchCoord --> SearchHydrator
    SearchHydrator --> MetaEng

    Scheduler ==> Workers
    Workers --> Disk
    Workers --> DB

    style Sub_Library fill:#dae8fc,stroke:#6c8ebf
    style Sub_Queue fill:#d5e8d4,stroke:#82b366
    style Sub_Metadata fill:#ffe6cc,stroke:#d79b00
    style Sub_Collections fill:#e1d5e7,stroke:#9673a6
    style Sub_Search fill:#f8cecc,stroke:#b85450
    style Sub_Workers fill:#fff2cc,stroke:#d6b656
    style Sub_Storage fill:#f5f5f5,stroke:#999999
```

---

## 3. Cross-Cutting Event Bus Topology

Engines communicate reactively using typed asynchronous event buses rather than tight couplings:

```mermaid
graph LR
    subgraph Publishers ["Event Publishers"]
        ScannerPub(LibraryScanner / Reconciler)
        MetadataPub(MetadataTransactionManager)
        CollectionPub(PlaylistEngine / OperationExecutor)
        JobPub(JobScheduler / Workers)
    end

    subgraph Buses ["Typed Domain Event Buses"]
        LibBus[/LibraryEventBus/]
        MetaBus[/MetadataEventBus/]
        CollBus[/CollectionEventBus/]
        ObsBus[/libraryObservability/]
    end

    subgraph Subscribers ["Reactive Consumers"]
        SearchSub(SearchCoordinator / Cache Invalidator)
        SmartPlSub(SmartPlaylistScheduler)
        ChoreographySub(registerLibraryChoreography)
        UIPushSub(sendMessageToRenderer IPC Bridge)
    end

    ScannerPub ==>|'SongAdded', 'SongRemoved'| LibBus
    MetadataPub ==>|'SongMetadataChanged'| LibBus
    MetadataPub ==>|'MetadataOverrideChanged'| MetaBus
    CollectionPub ==>|'CollectionChanged', 'CollectionDeleted'| CollBus
    JobPub ==>|'JOB_COMPLETED', 'METRICS_UPDATED'| ObsBus

    LibBus --> SearchSub
    LibBus --> SmartPlSub
    CollBus --> SmartPlSub
    ObsBus --> ChoreographySub
    ObsBus --> UIPushSub
    CollBus --> UIPushSub

    style LibBus fill:#dae8fc,stroke:#6c8ebf
    style MetaBus fill:#ffe6cc,stroke:#d79b00
    style CollBus fill:#e1d5e7,stroke:#9673a6
    style ObsBus fill:#fff2cc,stroke:#d6b656
```

---

## 4. Subsystem Directory Mapping

| Subsystem                     | Main Source Directory                                                                                                                                                                                                                                                                                                                                                                                        | Renderer Source Directory                                                                                                                                                                             | Key Architectural Roles                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Library Scanner & Builder** | [`src/main/library/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/library), [`src/main/fs/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/fs), [`src/main/workers/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/workers) | `src/renderer/src/components/MusicFoldersPage/`                                                                                                                                                       | Disk discovery, diff engine, hierarchy creation, bounded worker pool ingestion, asynchronous asset scheduler.          |
| **Queue & Playback**          | [`src/main/queue/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/queue)                                                                                                                                                                                                                                                                           | [`src/renderer/src/other/queuesManager.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/renderer/src/other/queuesManager.ts), `playerQueue.ts` | In-memory playback state, shuffle permutation index translation, active track anchoring, multi-queue management.       |
| **Metadata Platform**         | [`src/main/metadata/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/metadata)                                                                                                                                                                                                                                                                     | `src/renderer/src/components/autotag/`, `metadatacenter/`                                                                                                                                             | Single metadata authority, provider federation (MusicBrainz, Discogs, CAA), Option A atomic transactions, undo tokens. |
| **Collections & Playlists**   | [`src/main/collections/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/collections), `playlistImport/`, `playlistSync/`                                                                                                                                                                                                                           | `src/renderer/src/components/PlaylistsPage/`                                                                                                                                                          | Operation framework, reversible journal, linear pointer undo/redo, smart playlist AST compiler, M3U import & repair.   |
| **Search & Indexing**         | [`src/main/search/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/search)                                                                                                                                                                                                                                                                         | `src/renderer/src/components/SearchPage/`                                                                                                                                                             | Query normalization, parallel engine dispatch, match tier ranking, single-pass batched hydration via search gateway.   |
| **Database & Persistence**    | [`src/main/db/`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/db)                                                                                                                                                                                                                                                                                 | N/A (Isolated to Main)                                                                                                                                                                                | Drizzle ORM schema (24+ tables), trigram indexes, foreign key cascades, atomic transactions.                           |
| **IPC & Platform Bridge**     | [`src/main/ipc.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/ipc.ts), `main.ts`, `platform/`                                                                                                                                                                                                                                                  | `src/preload/index.ts`, `api/`                                                                                                                                                                        | ContextBridge isolation, typed IPC invocation, power monitor, Discord RPC, Last.fm scrobbling, window management.      |
