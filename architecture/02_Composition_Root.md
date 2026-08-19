# 02. Composition Root & Bootstrap Architecture

All dependency injection, service instantiation, and lifecycle wiring in Nora takes place across dedicated, structured composition roots. This document maps the system-wide bootstrap sequence from Electron application launch to full UI readiness.

---

## 1. Master System Construction Flow

The application initializes linearly in strict dependency order inside [`src/main/main.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/main.ts) and [`src/main/ipc.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/ipc.ts):

```mermaid
graph TD
    subgraph Step1 ["Phase 1: Platform & Database Setup"]
        Platform[/PlatformBootstrap/] -.-> ReqPipe[/Shared RequestPipeline/]
        ReqPipe ==> RateLimiter[/RateLimiter: 1 req/sec/]
        ReqPipe ==> RetryPolicy[/RetryPolicy: 3 retries/]
        DBSync[(SQLite DB Initialization & Seed)]
    end

    subgraph Step2 ["Phase 2: Worker & Scheduler Infrastructure"]
        Scheduler[/libraryScheduler.start/]
        PolicyEngine[/adaptivePolicyEngine.start/]
        Choreography[/registerLibraryChoreography/]
        MaintReq[/libraryScheduler.requestMaintenance - GC/]
    end

    subgraph Step3 ["Phase 3: Subsystem Composition Roots"]
        CollBoot[Collections Bootstrap: PlaylistEngine, UndoEngine, Hierarchy]
        MetaBoot[MetadataBootstrap.getInstance: Engine, Resolution, TxMgr]
    end

    subgraph Step4 ["Phase 4: Lifecycle & Discovery Setup"]
        Lifecycle(LibraryLifecycleController.initialize)
        Watchers[/Passive Folder Watchers/]
        RecoverySync[/recoverLibraryAssets startup sync/]
    end

    subgraph Step5 ["Phase 5: IPC Channel Registrations"]
        IPC_Coll[setupCollectionIpc]
        IPC_Import[setupPlaylistImportIpc]
        IPC_Export[setupPlaylistExportIpc]
        IPC_Meta[registerMetadataHandlers & registerMetadataIPCHandlers]
        IPC_Member[registerMembershipIPCHandlers]
        IPC_Core[Core IPC Handlers: library, playback, window]
    end

    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Step4
    Step4 --> Step5

    style Step1 fill:#f5f5f5,stroke:#999999
    style Step2 fill:#fff2cc,stroke:#d6b656
    style Step3 fill:#d5e8d4,stroke:#82b366
    style Step4 fill:#dae8fc,stroke:#6c8ebf
    style Step5 fill:#e1d5e7,stroke:#9673a6
```

---

## 2. Phase-by-Phase Bootstrap Detailed Breakdown

### Phase 1: Platform & Networking Infrastructure Setup
The [`PlatformBootstrap`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/platform/PlatformBootstrap.ts) initializes shared networking primitives used across remote API adapters.
- Instantiates a shared [`RequestPipeline`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/platform/networking/RequestPipeline.ts) configured with global rate limiting (1 req/sec for MusicBrainz compliance) and exponential backoff retry policies.
- Connects SQLite database via Drizzle ORM ([`src/main/db/db.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/db/db.ts)) and verifies foreign key constraints.

```mermaid
graph LR
    Platform[PlatformBootstrap] -.-> Pipeline[RequestPipeline]
    Pipeline ==> RL[RateLimiter: 1 req/s]
    Pipeline ==> RP[RetryPolicy: 3 retries]
    Pipeline --> NetClients[MBClient / DiscogsClient / CaaClient]
```

---

### Phase 2: Background Schedulers & Choreography Initialization
In [`initializeIPC`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/ipc.ts#L135-L155):
1. Starts [`libraryScheduler`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/workers/jobScheduler.ts) event loop with configured concurrency limits (`interactive: 4`, `background: 2`, `maintenance: 1`).
2. Starts [`adaptivePolicyEngine`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/workers/adaptivePolicyEngine.ts) to adjust concurrency based on battery power and system load.
3. Requests startup maintenance (triggering [`garbageCollectionJob`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/workers/jobs/garbageCollectionJob.ts) once initial queues idle).
4. Invokes [`registerLibraryChoreography()`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/workers/libraryChoreography.ts) to hook event-driven pipeline transitions (`ARTWORK_READY` $\rightarrow$ Enqueue `PaletteJob`).

```mermaid
graph TD
    SchedulerStart(libraryScheduler.start) --> PolicyStart(adaptivePolicyEngine.start)
    PolicyStart --> RegisterChoreography(registerLibraryChoreography)
    RegisterChoreography --> GCRequest(libraryScheduler.requestMaintenance)
    RegisterChoreography --> Observability(libraryObservability.on METRICS_UPDATED)
```

---

### Phase 3: Composition Roots & Dependency Wiring

#### Collections Composition Root (`src/main/collections/setup.ts`)
Assembles singleton controllers:
- `playlistRepository` $\rightarrow$ `OperationExecutor` $\rightarrow$ `PlaylistEngine`
- `hierarchyService` $\rightarrow$ `FolderStatisticsService` $\rightarrow$ `UndoEngine`

```mermaid
graph TD
    Repo[(PlaylistRepository)] --> OpExec(OperationExecutor)
    MemSvc(MembershipService) --> OpExec
    OpExec --> PlEngine(PlaylistEngine)
    Hierarchy(HierarchyService) --> PlEngine
    Hierarchy --> Undo(UndoEngine)
```

#### Metadata Composition Root (`src/main/metadata/setup.ts`)
The [`MetadataBootstrap.bootstrap()`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/metadata/setup.ts#L139-L373) method builds the entire metadata dependency tree:

```mermaid
graph TD
    subgraph Adapters ["Remote & Local Adapters"]
        MB[[MusicBrainzAdapter]]
        Discogs[[DiscogsAdapter]]
        CAA[[CoverArtArchiveAdapter]]
        Local[[LocalMetadataAdapter]]
        User[[UserMetadataAdapter]]
    end

    subgraph ResolutionLayer ["Resolution Subsystem"]
        ResReg{ResolutionProviderRegistry}
        ProvExec(MetadataProviderExecutor)
        LookupGW(DefaultMetadataLookupGateway)
        ResMgr(MetadataResolutionManager)
    end

    subgraph TransactionLayer ["Transaction Subsystem"]
        RelSync(LibraryRelationalSyncService)
        ArtDownloader(ArtworkDownloaderService)
        MutExec(MutationExecutor)
        TxMgr(MetadataTransactionManager)
        HistSvc(MetadataHistoryService)
    end

    subgraph AppLayer ["Application Services"]
        AutoTag(AlbumAutoTagService)
        Workflows(MetadataWorkflowService)
        ApplySvc(MetadataApplyService)
        PrefSvc(MetadataPreferencesService)
    end

    MB --> ResReg
    Discogs --> ResReg
    CAA --> ResReg
    Local --> ResReg
    User --> ResReg

    ResReg --> ProvExec
    ProvExec --> LookupGW
    LookupGW --> ResMgr
    ResMgr --> AutoTag

    RelSync --> MutExec
    ArtDownloader --> TxMgr
    MutExec --> TxMgr
    HistSvc --> TxMgr
    TxMgr --> Workflows
    TxMgr --> AutoTag
```

---

### Phase 4: Lifecycle Controller & Watchers Initialization
In [`src/main/library/LibraryLifecycleController.ts`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/library/LibraryLifecycleController.ts):
1. Reads `user_settings.libraryScanMode` (`'automatic'`, `'startup'`, or `'manual'`).
2. If `'automatic'`, attaches passive directory watchers via [`initializePassiveWatchers()`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/fs/initializePassiveWatchers.ts) and binds generation-tracking change listeners.
3. Fires non-blocking startup background scan [`scanNow()`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/library/LibraryLifecycleController.ts#L232-L275).
4. Runs asynchronous startup asset recovery sync [`recoverLibraryAssets()`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/core/recovery.ts).

```mermaid
graph TD
    Init[LifecycleController.initialize] --> ReadSettings[(Read user_settings.libraryScanMode)]
    ReadSettings --> CheckMode{Scan Mode?}
    CheckMode -->|automatic| StartWatchers[Start Passive Watchers]
    StartWatchers --> TriggerScan[Trigger Startup Background Scan]
    CheckMode -->|startup| TriggerScan
    CheckMode -->|manual| IdleState[Remain Idle]
    TriggerScan --> RecoverySync[recoverLibraryAssets Sync]
```

---

### Phase 5: IPC Channel Registrations
All IPC bridges are registered with strict dependency injection:
- `setupCollectionIpc(playlistEngine, undoEngine, playlistRepository, hierarchyService, sendWebContents)`
- `setupPlaylistImportIpc(playlistImportWorkflow, importHistoryService)`
- `setupPlaylistExportIpc(playlistRepository)`
- `registerMetadataHandlers(autoTagService, workflowService, preferencesService, mainWindow, providerRuntime)`
- `registerMembershipIPCHandlers()`

---

## 3. Container Namespace Structure (`MetadataContainer`)

`MetadataContainer` groups constructed services into immutable domain namespaces:

```ts
export interface MetadataContainer {
  application: {
    userService: UserMetadataService;
    albumMetadataService: AlbumMetadataService;
    autoTagService: AlbumAutoTagService;
    workflowService: MetadataWorkflowService;
    applyService: MetadataApplyService;
    preferencesService: MetadataPreferencesService;
    providerRuntime: MetadataProviderRuntime;
  };
  resolution: {
    resolutionManager: MetadataResolutionManager;
    lookupGateway: DefaultMetadataLookupGateway;
  };
  transactions: {
    transactionManager: MetadataTransactionManager;
  };
  infrastructure: {
    requestPipeline: RequestPipeline;
  };
}
```

---

## 4. Graceful Shutdown & Disposal Lifecycle

When the application closes, resources unwind deterministically:

```mermaid
sequenceDiagram
    autonumber
    actor OS as Operating System / User
    participant Main as main.ts (before-quit)
    participant Lifecycle as LibraryLifecycleController
    participant Scheduler as JobScheduler
    participant DB as SQLite DB

    OS->>Main: app.quit() / window-all-closed
    Main->>Lifecycle: shutdown()
    Lifecycle->>Lifecycle: stopWatchers() (closeAllAbortControllers)
    Lifecycle->>Lifecycle: cancelScan()
    Lifecycle-->>Main: Watchers Closed
    Main->>Scheduler: stop() (drain in-flight workers)
    Scheduler->>Scheduler: dispose() (cancel active jobs)
    Scheduler-->>Main: Schedulers Disposed
    Main->>DB: close connections
    Main-->>OS: Process Exit (0)
```
