# 07. Metadata Platform Architecture

This document provides a comprehensive technical specification of Nora's **Metadata Platform & Transaction Subsystem**, reflecting recent architectural updates, resilient provider execution, multi-provider federation, and Option A atomic transaction rollback semantics.

---

## 1. High-Level Subsystem Architecture

The Metadata Platform establishes [`MetadataEngine`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/metadata/engine/MetadataEngine.ts) as the sole authority for metadata state across Nora, completely isolating Presentation components from physical file writes and raw database queries.

```mermaid
graph TD
    subgraph PresTier ["Presentation Tier (Renderer / UI)"]
        UI_AutoTag[AutoTag Modal / Match Inspector]
        UI_ManualEdit[Tag Editing Forms / SongTagsEditingPage]
    end

    subgraph AppTier ["Application Services Layer"]
        AutoTagSvc(AlbumAutoTagService)
        WorkflowSvc(MetadataWorkflowService)
        ApplySvc(MetadataApplyService)
        PrefSvc(MetadataPreferencesService)
        UserSvc(UserMetadataService)
    end

    subgraph ResolutionTier ["Resolution Platform (Pillar B)"]
        ResMgr(MetadataResolutionManager)
        LookupGW(DefaultMetadataLookupGateway)
        MergeEngine(MetadataMergeEngine)
        MergePolicy{DefaultMetadataMergePolicy}
    end

    subgraph ProviderTier ["Provider Infrastructure (Pillar A)"]
        ProvExec(MetadataProviderExecutor)
        ProvReg{ResolutionProviderRegistry}
        Discovery(MetadataProviderDiscovery)
        Resilience[/CircuitBreaker, RateLimiter, Retry, Timeout, Diagnostics/]
    end

    subgraph Adapters ["External & Internal Provider Adapters"]
        MB[[MusicBrainzAdapter]]
        Discogs[[DiscogsAdapter]]
        CAA[[CoverArtArchiveAdapter]]
        LocalAdapter[[LocalMetadataAdapter]]
        UserAdapter[[UserMetadataAdapter]]
    end

    subgraph TransactionTier ["Storage & Transaction Layer"]
        TxMgr(MetadataTransactionManager - Coordinator)
        MutExec(MutationExecutor)
        TagWriter(TagWriterService - TagLib Disk ID3)
        RelSync[(LibraryRelationalSyncService - SQLite DB)]
        ArtDownloader[/ArtworkDownloaderService/]
        HistorySvc(MetadataHistoryService)
    end

    UI_AutoTag --> AutoTagSvc
    UI_ManualEdit --> WorkflowSvc

    AutoTagSvc --> ResMgr
    AutoTagSvc --> TxMgr
    WorkflowSvc --> TxMgr

    ResMgr ==> LookupGW
    ResMgr ==> MergeEngine
    MergeEngine --> MergePolicy

    LookupGW --> ProvExec
    ProvExec ==> ProvReg
    ProvExec ==> Discovery
    ProvExec ==> Resilience

    ProvReg --> MB
    ProvReg --> Discogs
    ProvReg --> CAA
    ProvReg --> LocalAdapter
    ProvReg --> UserAdapter

    TxMgr ==> MutExec
    TxMgr ==> ArtDownloader
    TxMgr ==> HistorySvc
    MutExec --> TagWriter
    MutExec --> RelSync

    style ResolutionTier fill:#dae8fc,stroke:#6c8ebf
    style ProviderTier fill:#d5e8d4,stroke:#82b366
    style TransactionTier fill:#fff2cc,stroke:#d6b656
    style Adapters fill:#ffe6cc,stroke:#d79b00
```

---

## 2. Detailed Process Breakdown

### Process 1: Metadata Engine & Query Pipeline (`MetadataEngine.ts`)
Executes domain metadata queries through a structured pipeline with identity resolution, cache lookups, and validation policies.

```mermaid
flowchart TD
    QueryStart([Metadata Query for Entity Identity]) --> CheckCache{In MetadataCache?}
    CheckCache -->|Yes & Valid| ReturnCached[Return Cached MetadataResource]
    CheckCache -->|No| BuildPlan[MetadataQueryPlanner creates QueryPlan]
    BuildPlan --> ExecPlan[MetadataPipeline processes loaders]
    ExecPlan --> ValidatePolicy{ValidationPolicy passes?}
    ValidatePolicy -->|Failed| ThrowValErr[Throw Validation Policy Error]
    ValidatePolicy -->|Passed| ConflictCheck[Evaluate ConflictPolicy]
    ConflictCheck --> StoreCache[Store in MetadataCache]
    StoreCache --> EmitRefresh[Emit MetadataRefreshed]
    EmitRefresh --> QueryDone([Return Normalized MetadataResource])

    style ReturnCached fill:#d5e8d4,stroke:#82b366
    style StoreCache fill:#dae8fc,stroke:#6c8ebf
    style ThrowValErr fill:#f8cecc,stroke:#b85450
```

---

### Process 2: Multi-Provider Discovery & Dynamic Priority Registration
Dynamically discovers and configures local and remote providers based on user preferences and capability descriptors.

```mermaid
flowchart TD
    DiscStart([MetadataProviderDiscovery.discoverAll]) --> ReadPrefs[Load User Metadata Preferences]
    ReadPrefs --> LoopFactories{Iterate Registered Adapter Factories}
    LoopFactories -->|Next Adapter| CreateAdapter[Instantiate Adapter]
    CreateAdapter --> ReadCaps[Extract ProviderCapabilities & Identity]
    ReadCaps --> AssignPriority[Assign Configured Priority: User=1000, Local=100, MB=500]
    AssignPriority --> RegisterRuntime[Register in RuntimeMetadataProviderRegistry]
    RegisterRuntime --> LoopFactories
    LoopFactories -->|All Registered| DiscDone([Provider Registry Assembled])

    style RegisterRuntime fill:#d5e8d4,stroke:#82b366
```

---

### Process 3: Resilient Provider Execution Pipeline (`MetadataProviderExecutor.ts`)
Guarantees 100% isolation for all external HTTP queries. No remote failure or rate limit (HTTP 429) can crash the UI or freeze the Node.js event loop.

**Resilience Layers**:
1. **`RateLimiter`**: Enforces 1 request/second per remote domain.
2. **`CircuitBreaker`**: Opens after consecutive threshold failures to prevent cascading latency.
3. **`RetryPolicy`**: 3 exponential backoff retries on network dropouts.
4. **`ProviderTimeoutPolicy`**: Hard timeout per remote request (default 8000ms).
5. **`ProviderDiagnosticsTracker`**: Centrally logs metrics and status codes.

```mermaid
flowchart TD
    ReqStart([Provider Query Dispatched]) --> CheckCB{CircuitBreaker State?}
    CheckCB -->|OPEN| FastFail[Throw CircuitBreakerOpenException immediately]
    CheckCB -->|CLOSED / HALF-OPEN| EnforceRateLimit[Wait in RateLimiter Queue: 1 req/sec]
    EnforceRateLimit --> ApplyTimeout[Wrap in Timeout Promise: 8000ms]
    ApplyTimeout --> ExecFetch[Execute Provider HTTP Fetch]
    ExecFetch --> ResultCheck{HTTP Success?}
    ResultCheck -->|Success 200| RecordSuccess[Record CB Success & Diagnostics]
    ResultCheck -->|Error / Timeout / 429| CheckRetries{Retries Remaining < 3?}
    CheckRetries -->|Yes| BackoffDelay[Exponential Backoff Delay]
    BackoffDelay --> ExecFetch
    CheckRetries -->|No| RecordFailure[Trip CircuitBreaker & Log Diagnostics]
    RecordSuccess --> ReturnContrib[Return Provider Contributions]
    RecordFailure --> ThrowError[Throw Resilient Provider Error]

    style RecordSuccess fill:#d5e8d4,stroke:#82b366
    style FastFail fill:#f8cecc,stroke:#b85450
    style RecordFailure fill:#f8cecc,stroke:#b85450
```

---

### Process 4: Field-Level Policy Merging & Attribution Badges (`MetadataMergeEngine.ts`)
Merges conflicting field contributions across disparate providers into a unified release snapshot, attaching explicit provider attribution badges.

**Attribution Rule Matrix**:
- **Title, Artist, Track Number, MBID**: MusicBrainz takes precedence (`badge: 'musicbrainz'`).
- **Genres & Master Styles**: Discogs takes precedence (`badge: 'discogs'`).
- **Cover Artwork URLs**: Cover Art Archive takes precedence (`badge: 'coverartarchive'`).
- **User Overrides**: Always supersede all remote providers (`priority: 1000`).

```mermaid
flowchart TD
    MergeStart([Raw Federated Provider Contributions]) --> GroupFields[Group Contributions by Field: title, artist, genre, artwork]
    GroupFields --> FieldLoop{For each Field}
    FieldLoop --> EvalPriority[Evaluate Provider Priority & Confidence]
    EvalPriority --> ResolveWinner[Select Winning Contribution]
    ResolveWinner --> AttachBadge[Attach ProviderAttribution: id, confidence, name]
    AttachBadge --> FieldLoop
    FieldLoop -->|All Merged| BuildSnapshot[Build Merged Candidate Snapshot]
    BuildSnapshot --> MergeDone([Return MetadataResolution Result])

    style AttachBadge fill:#ffe6cc,stroke:#d79b00
    style BuildSnapshot fill:#dae8fc,stroke:#6c8ebf
```

---

### Process 5: Candidate Resolution & UI Preview Generation
Coordinates user release searches, producing a typed [`MetadataPreview`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/common/metadata/preview.ts) showing old vs. new values before physical disk write.

```mermaid
flowchart TD
    UserSearch([User Search Release Name & Artist]) --> Lookup[DefaultMetadataLookupGateway.searchCandidates]
    Lookup --> ConcurrentExec[MetadataProviderExecutor queries MB, Discogs, CAA]
    ConcurrentExec --> MergeContribs[MetadataMergeEngine merges fields]
    MergeContribs --> BuildDiff[MetadataDiffBuilder compares with current DB tags]
    BuildDiff --> GenPreview[Generate MetadataPreview DTO]
    GenPreview --> ShowModal([Display AutoTag Preview Modal in React UI])

    style GenPreview fill:#d5e8d4,stroke:#82b366
    style ShowModal fill:#e1f5fe,stroke:#0288d1
```

---

### Process 6: Option A Whole-Transaction Batch Execution (`MetadataTransactionManager.ts`)
Executes metadata mutations in chunks of 50 files. If ANY mutation fails, the transaction coordinator automatically rolls back all previously written files and database records to their pre-transaction states.

```mermaid
flowchart TD
    TxStart([executeTransaction operationId, mutations]) --> DownArtwork{Artwork Replacement Requested?}
    DownArtwork -->|Yes| FetchArt[ArtworkDownloaderService fetches & validates buffer]
    DownArtwork -->|No| SplitChunks[Slice mutations into 50-item chunks]
    FetchArt --> SplitChunks

    SplitChunks --> ChunkLoop{For each Chunk}
    ChunkLoop --> CheckCancel{AbortSignal Triggered?}
    CheckCancel -->|Yes| AbortTx[Set isCancelled & Trigger Rollback]
    CheckCancel -->|No| MutateItem[Execute MutationExecutor on each track]

    MutateItem --> TagLibDisk[TagWriterService writes ID3 tags to Disk]
    TagLibDisk --> DBSync[LibraryRelationalSyncService updates SQLite DB]
    DBSync --> CheckMutSuccess{Mutation OK?}
    CheckMutSuccess -->|Yes| PushDraft[Push draftSnapshot to rollback stack]
    CheckMutSuccess -->|No| FailTx[Record Error & Trigger Rollback]

    PushDraft --> ChunkLoop
    ChunkLoop -->|All Chunks Succeeded| CommitTx[Push History Snapshot with UndoToken]
    CommitTx --> InvalArtCache[ArtworkCacheInvalidator cleans image cache]
    InvalArtCache --> TxSuccess([Return TransactionResult: Success = true])

    AbortTx --> ExecRollback[Process 7: Rollback Applied Snapshots in Reverse]
    FailTx --> ExecRollback
    ExecRollback --> TxFailed([Return TransactionResult: Success = false, rolledBack = true])

    style TxSuccess fill:#d5e8d4,stroke:#82b366
    style TxFailed fill:#f8cecc,stroke:#b85450
```

---

### Process 7: Atomic Rollback & Snapshot Playback
Iterates backwards through `draftSnapshots`, using [`MutationExecutor`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/metadata/transactions/MutationExecutor.ts) to restore both physical disk tags and SQLite rows to their exact pre-transaction state.

```mermaid
flowchart TD
    RollbackStart([Rollback Triggered]) --> ReverseSnapshots[Reverse draftSnapshots array]
    ReverseSnapshots --> SnapLoop{For each snapshot}
    SnapLoop --> ReadPrev[Extract previousTags & previousState]
    SnapLoop --> RevertDisk[TagWriterService rewrites previous ID3 tags]
    RevertDisk --> RevertDB[LibraryRelationalSyncService rewrites previous DB record]
    RevertDB --> SnapLoop
    SnapLoop -->|All Restored| ClearDrafts[Clear draftSnapshots array]
    ClearDrafts --> RollbackDone([System Restored to Pre-Transaction State])

    style RevertDisk fill:#fff2cc,stroke:#d6b656
    style RevertDB fill:#fff2cc,stroke:#d6b656
```

---

### Process 8: Artwork Downloading & Cache Invalidation
Validates and fetches remote artwork images via the resilient request pipeline and invalidates local image caches upon successful commit.

```mermaid
flowchart TD
    ArtStart([fetchAndValidateArtwork artworkUrl]) --> PipeFetch[RequestPipeline fetches image bytes]
    PipeFetch --> ValidateBuffer{Is valid JPEG/PNG Buffer?}
    ValidateBuffer -->|Yes| ReturnBuf[Return validated artworkBuffer]
    ValidateBuffer -->|No| ReturnUndef[Return undefined & log warning]

    PostTx([Transaction Succeeded with Artwork]) --> InvalCache[ArtworkCacheInvalidator.invalidateArtworkCache]
    InvalCache --> ClearSongArt[Clear songArtworksPath cache keys]
    InvalCache --> ClearAlbumArt[Clear albumArtworksPath cache keys]
    ClearSongArt --> InvalDone([UI Image Cache Refreshed])
    ClearAlbumArt --> InvalDone

    style ReturnBuf fill:#d5e8d4,stroke:#82b366
    style InvalCache fill:#ffe6cc,stroke:#d79b00
```

---

### Process 9: Undo Token & History Snapshot Management (`MetadataHistoryService.ts`)
Manages immutable undo snapshots, allowing one-click multi-level rollback across app sessions.

```mermaid
flowchart TD
    HistStart([Push History Snapshot]) --> CreateToken[Generate UndoToken id, operationId, timestamp]
    CreateToken --> PushStack[undoStack.push historySnapshot]
    PushStack --> CheckLimit{Stack length > 50?}
    CheckLimit -->|Yes| ShiftOldest[undoStack.shift drop oldest snapshot]
    CheckLimit -->|No| HistDone([History Stack Updated])
    ShiftOldest --> HistDone

    UserUndo([User Triggers Undo]) --> PopUndo[historyService.popUndo targetSongId]
    PopUndo --> ReplayRevert[Execute rollbackLastTransaction using previous snapshot]
    ReplayRevert --> MoveRedo[redoStack.push undoneSnapshot]
    MoveRedo --> UndoDone([Undo Reversion Complete])

    style CreateToken fill:#dae8fc,stroke:#6c8ebf
    style ReplayRevert fill:#fff2cc,stroke:#d6b656
```

---

### Process 10: Metadata Domain Workflows (`MetadataWorkflowService.ts`)
Encapsulates specialized domain workflows for granular tag editing:
- **`AlbumWorkflow`**: Resolves multi-track album structures.
- **`GenreWorkflow`**: Fetches community-tagged musical styles from Discogs.
- **`ArtworkWorkflow`**: Resolves high-resolution cover artwork from CAA.
- **`TrackWorkflow`**: Resolves ISRC, track numbers, and MusicBrainz recording IDs.

```mermaid
flowchart TD
    WorkflowStart([WorkflowService.executeWorkflow]) --> RouteWorkflow{Workflow Type?}
    RouteWorkflow -->|Album| ExecAlbum[AlbumWorkflow.execute]
    RouteWorkflow -->|Genre| ExecGenre[GenreWorkflow.execute via Discogs]
    RouteWorkflow -->|Artwork| ExecArtwork[ArtworkWorkflow.execute via CAA & Discogs]
    RouteWorkflow -->|Track| ExecTrack[TrackWorkflow.execute via MusicBrainz]

    ExecAlbum --> BuildMutations[Build ResourceMutationPayload[]]
    ExecGenre --> BuildMutations
    ExecArtwork --> BuildMutations
    ExecTrack --> BuildMutations

    BuildMutations --> TxMgrExec[MetadataTransactionManager.executeTransaction]
    TxMgrExec --> WorkflowEnd([Workflow Completed Atomically])

    style ExecAlbum fill:#dae8fc,stroke:#6c8ebf
    style ExecGenre fill:#ffe6cc,stroke:#d79b00
    style ExecArtwork fill:#d5e8d4,stroke:#82b366
    style ExecTrack fill:#e1d5e7,stroke:#9673a6
```

---

## 3. Multi-Process Metadata Platform Choreography Graph

The following composite flowchart illustrates the complete journey of a metadata update from user search to atomic file write:

```mermaid
graph TD
    UserSearch[User Requests Album AutoTag] --> ResolveCandidates[Process 2 & 5: Candidate Resolution & Discovery]
    ResolveCandidates --> ResilientExec[Process 3: Resilient Provider Execution via CB & RateLimit]
    ResilientExec --> MergeFields[Process 4: Field-Level Policy Merging & Badges]
    MergeFields --> PreviewGen[Process 5: MetadataPreview Generated]
    PreviewGen --> UserApprove[User Reviews & Approves Changes]
    UserApprove --> BeginTx[Process 6: Whole-Transaction Batch Execution]
    BeginTx --> DownArt[Process 8: Artwork Download & Buffer Validation]
    DownArt --> ChunkExec[Process 6: 50-Item Chunk Processing via MutationExecutor]
    ChunkExec --> DiskWrite[TagWriter writes ID3 to Disk]
    DiskWrite --> DBRelSync[LibraryRelationalSync updates SQLite DB]
    DBRelSync --> RecordHistory[Process 9: Record UndoToken & History Snapshot]
    RecordHistory --> InvalidateCache[Process 8: Invalidate Image & Query Caches]
    InvalidateCache --> CompleteNotice[Publish MetadataTransactionCompleted Event]

    style UserSearch fill:#f5f5f5,stroke:#999999
    style ResilientExec fill:#d5e8d4,stroke:#82b366
    style MergeFields fill:#ffe6cc,stroke:#d79b00
    style DiskWrite fill:#fff2cc,stroke:#d6b656
    style CompleteNotice fill:#dae8fc,stroke:#6c8ebf
```
