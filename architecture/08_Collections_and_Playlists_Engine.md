# 08. Collections & Playlists Engine Architecture

This document provides a comprehensive technical specification of Nora's **Collections Subsystem, Reversible Operation Framework, Smart Playlist Compiler, and Playlist Importing Engine**.

---

## 1. High-Level Subsystem Architecture

The Collections Subsystem implements a strictly layered architecture separating raw database joins from in-memory reactivity, operation journaling, and AST evaluations.

```mermaid
graph TD
    subgraph PresentationTier ["Presentation Tier (Renderer UI)"]
        UI_Playlists[Playlists Page / Folder Tree]
        UI_SmartEditor[Smart Playlist AST Rule Builder]
        UI_ImportModal[Playlist Import Preview & Repair UI]
    end

    subgraph IPCTier ["IPC Tier"]
        IPC_Coll[setupCollectionIpc]
        IPC_Import[setupPlaylistImportIpc]
        IPC_Export[setupPlaylistExportIpc]
    end

    subgraph EngineTier ["Application Engines Layer"]
        PlEngine(PlaylistEngine)
        SmartPlEngine(SmartPlaylistEngine)
        SmartScheduler(SmartPlaylistScheduler)
        UndoEngine(UndoEngine)
        ImportWorkflow(PlaylistImportWorkflow)
    end

    subgraph CorePlatform ["Operation & Membership Framework"]
        OpExec(OperationExecutor)
        OpReg{OperationRegistry}
        Hierarchy(HierarchyService)
        FolderStats(FolderStatisticsService)
        MemService(MembershipService & Cache)
    end

    subgraph ImportPipeline ["Playlist Importing Pipeline"]
        ImporterReg{PlaylistImporterRegistry}
        PathResolver(PlaylistPathResolver)
        Verifier(FilesystemVerifier)
        RepairEngine(PlaylistRepairEngine)
        ImportPlanner(PlaylistImportPlanner)
        ImportExecutor(PlaylistImportExecutor)
        SessionService(PlaylistImportSessionService)
    end

    subgraph StorageTier ["Persistence Tier (Drizzle SQLite DB)"]
        PlRepo[(PlaylistRepository)]
        JournalRepo[(OperationJournalRepository)]
        DB[(playlists, playlist_entries, smart_playlist_rules, operation_journal)]
    end

    UI_Playlists --> IPC_Coll
    UI_SmartEditor --> IPC_Coll
    UI_ImportModal --> IPC_Import

    IPC_Coll --> PlEngine
    IPC_Coll --> UndoEngine
    IPC_Coll --> SmartPlEngine
    IPC_Import --> ImportWorkflow

    PlEngine --> OpExec
    PlEngine --> Hierarchy
    PlEngine --> FolderStats
    UndoEngine --> OpExec
    SmartPlEngine --> PlRepo
    SmartScheduler --> SmartPlEngine

    ImportWorkflow --> ImportPipeline
    ImportPipeline --> ImporterReg
    ImportPipeline --> PathResolver
    ImportPipeline --> Verifier
    ImportPipeline --> RepairEngine
    ImportPipeline --> ImportPlanner
    ImportPipeline --> ImportExecutor

    OpExec --> OpReg
    OpExec --> PlRepo
    OpExec --> JournalRepo
    OpExec --> MemService

    PlRepo --> DB
    JournalRepo --> DB
    ImportExecutor --> DB

    style EngineTier fill:#d5e8d4,stroke:#82b366
    style CorePlatform fill:#dae8fc,stroke:#6c8ebf
    style ImportPipeline fill:#ffe6cc,stroke:#d79b00
    style StorageTier fill:#fff2cc,stroke:#d6b656
```

---

## 2. Detailed Process Breakdown

### Process 1: Operation Lifecycle & Inverse Computation (`OperationExecutor.ts`)
All collection mutations execute through a standardized, reversible lifecycle that automatically computes and journals its exact reverse mutation.

**4-Step Lifecycle**:
1. **Pre-Validation**: Validates inputs, target playlist existence, and permissions.
2. **Transactional SQL Execution**: Executes raw mutations via `ctx.trx` and `PlaylistRepository`.
3. **Inversion Computation**: Computes exact inverse parameters (e.g. `AddSongsOp` computes `RemoveSongsInput`; `DeleteOp` computes a full restore payload with original IDs).
4. **Journaling**: Securely stores both forward and inverse inputs in `operation_journal`.

```mermaid
flowchart TD
    OpStart([Execute CollectionOperation]) --> PreVal{Pre-Validation Valid?}
    PreVal -->|Invalid| ThrowVal[Throw Validation Error]
    PreVal -->|Valid| BeginTx[BEGIN DB TRANSACTION]
    BeginTx --> ExecSQL[Execute SQL Mutation on PlaylistRepository]
    ExecSQL --> CompInverse[Compute Inverse Mutation Input]
    CompInverse --> WriteJournal[INSERT INTO operation_journal: forward & inverse data]
    WriteJournal --> InvalMem[Invalidate MembershipCache for affected songs]
    InvalMem --> CommitTx[COMMIT DB TRANSACTION]
    CommitTx --> EmitEvent[Publish CollectionEventBus: CollectionChanged]
    EmitEvent --> OpDone([Operation Completed with Reversible Journal])

    style WriteJournal fill:#dae8fc,stroke:#6c8ebf
    style CommitTx fill:#d5e8d4,stroke:#82b366
    style ThrowVal fill:#f8cecc,stroke:#b85450
```

---

### Process 2: Pointer-Based Linear Undo/Redo Model (`UndoEngine.ts`)
Undo/Redo uses a **pointer-based linear history** rather than branching operation trees.

**Invariants**:
- **Zero Journal Writes on Undo/Redo**: Reverting or reapplying an operation does not create new journal records; it merely navigates the `sequenceNumber` pointer.
- **`Undo`**: Decrements pointer (`-1`), fetches `inverseInput`, and executes the registered inverse operation.
- **`Redo`**: Increments pointer (`+1`), fetches `operationInput`, and executes the forward operation.
- **Redo Branch Discard**: If a user undoes, and then performs a *new* forward mutation, the new operation takes the current sequence pointer and overwrites future history, cleanly discarding the old redo branch.

```mermaid
flowchart TD
    UserUndo([User Triggers Undo]) --> ReadPointer[Read Current sequenceNumber for Collection]
    ReadPointer --> CheckZero{sequenceNumber <= 0?}
    CheckZero -->|Yes| NoOp[Nothing to Undo - Return]
    CheckZero -->|No| FetchJournal[SELECT FROM operation_journal WHERE sequence = pointer]
    FetchJournal --> LookupOp[OperationRegistry resolves matching inverse operation]
    LookupOp --> ExecInverse[OperationExecutor executes inverseInput in Transaction]
    ExecInverse --> DecPointer[sequenceNumber -= 1]
    DecPointer --> EmitUndoEvent[Publish CollectionEventBus: CollectionChanged]
    EmitUndoEvent --> UndoDone([Undo Completed])

    UserNewOp([User Performs New Forward Operation]) --> CheckFuture{Future Redo Entries Exist?}
    CheckFuture -->|Yes| DiscardRedo[DELETE FROM operation_journal WHERE sequence > currentPointer]
    CheckFuture -->|No| AppendOp[Insert New Journal Entry at currentPointer + 1]
    DiscardRedo --> AppendOp
    AppendOp --> SetNewPointer[sequenceNumber = newSequence]

    style FetchJournal fill:#dae8fc,stroke:#6c8ebf
    style ExecInverse fill:#d5e8d4,stroke:#82b366
    style DiscardRedo fill:#ffe6cc,stroke:#d79b00
```

---

### Process 3: Membership Caching & Fast In-Memory Lookups (`MembershipService.ts`)
Provides ultra-high-speed answers to *"Is song X in playlist Y or favorites?"* without running repetitive SQL joins.

**Mechanics**:
- Maintains an in-memory hash set of relationships (`Set<"playlistId:songId">`).
- When mutations occur, `PlaylistEngine` selectively invalidates only the `affectedSongIds`.

```mermaid
flowchart TD
    QueryMember([isSongInCollection songId, collectionId]) --> CheckCache{In MembershipCache?}
    CheckCache -->|Hit| ReturnResult[Return Cached Boolean in O 1]
    CheckCache -->|Miss| QueryDB[Query DB: SELECT 1 FROM playlist_entries]
    QueryDB --> StoreCache[Populate MembershipCache]
    StoreCache --> ReturnResult

    MutationEvt([Mutation Affects songIds]) --> InvalCache[membershipService.invalidateSongs affectedSongIds]
    InvalCache --> EvictKeys[Evict matching songId keys from Cache]
    EvictKeys --> InvalDone([Cache Invalidation Complete])

    style ReturnResult fill:#d5e8d4,stroke:#82b366
    style EvictKeys fill:#ffe6cc,stroke:#d79b00
```

---

### Process 4: Hierarchical Folder Nesting & Subtree Mutations (`HierarchyService.ts`)
Manages nested playlist folders with arbitrary depth, circular parentage prevention, and recursive subtree deletion.

```mermaid
flowchart TD
    MoveStart([moveCollection playlistIds, targetParentId]) --> CheckCircular{Is targetParentId descendant of playlistIds?}
    CheckCircular -->|Yes| ThrowCircular[Throw Circular Hierarchy Error]
    CheckCircular -->|No| UpdateParents[UPDATE playlists SET parent_id = targetParentId]
    UpdateParents --> RecalcDepth[Recalculate Folder Depths]
    RecalcDepth --> RecalcStats[FolderStatisticsService recalculates recursive songCount & duration]
    RecalcStats --> MoveDone([Hierarchy Updated])

    DeleteFolder([Delete Folder with Subtree]) --> FindDescendants[HierarchyService.getAllDescendantIds folderId]
    FindDescendants --> DeleteAllEntries[DELETE FROM playlist_entries WHERE playlist_id IN descendants]
    DeleteAllEntries --> DeletePlaylists[DELETE FROM playlists WHERE id IN descendants]
    DeleteAllPlaylists --> DeleteDone([Subtree Deleted Atomically])

    style ThrowCircular fill:#f8cecc,stroke:#b85450
    style RecalcStats fill:#dae8fc,stroke:#6c8ebf
    style DeleteAllEntries fill:#fff2cc,stroke:#d6b656
```

---

### Process 5: Smart Playlist AST Evaluation & Dynamic SQL Compilation (`SmartPlaylistEngine.ts`)
Compiles JSON rule ASTs into safe, parameterized SQL WHERE queries.

**Supported AST Node Types**:
- **Field Comparisons**: `title`, `artist`, `album`, `genre`, `year`, `playCount`, `skipCount`, `rating`, `duration`, `dateAdded`.
- **Operators**: `equals`, `contains`, `startsWith`, `endsWith`, `greaterThan`, `lessThan`, `inRange`, `isTrue`, `isFalse`.
- **Combinators**: `AND`, `OR`, `NOT`.

```mermaid
flowchart TD
    ASTStart([SmartPlaylistRuleAST JSON]) --> ValidateSchema{RuleValidator.validate AST}
    ValidateSchema -->|Invalid| ThrowASTErr[Throw Invalid AST Schema Error]
    ValidateSchema -->|Valid| ExtractDeps[Extract AST Field Dependencies]
    ExtractDeps --> Compiler[SmartPlaylistCompiler compiles to Drizzle SQL]
    Compiler --> BuildWhere[Generate SQL WHERE clause with parameterized values]
    BuildWhere --> ApplyLimits[Append ORDER BY sortDefinition & LIMIT maxEntries]
    ApplyLimits --> QueryDB[Execute SELECT songs JOIN ... WHERE compiledClause]
    QueryDB --> StoreRules[UPDATE smart_playlist_rules SET last_generated_at, rule_hash]
    StoreRules --> ASTDone([Return Evaluated SongData[]])

    style Compiler fill:#dae8fc,stroke:#6c8ebf
    style QueryDB fill:#d5e8d4,stroke:#82b366
```

---

### Process 6: Smart Playlist Scheduler & Reactive Invalidation (`SmartPlaylistScheduler.ts`)
Listens to global system event buses and automatically invalidates or regenerates smart playlists when their dependent fields change.

```mermaid
flowchart TD
    EventReceived([LibraryEventBus: SongMetadataChanged or SongAdded]) --> ExtractFields[Identify Changed Fields: e.g. genre, rating, playCount]
    ExtractFields --> FindAffected[Query smart_playlist_rules WHERE dependencies CONTAINS changedFields]
    FindAffected --> DebounceRegen[Debounce Regeneration: 1500ms]
    DebounceRegen --> TimerExpire{Timer Expired?}
    TimerExpire -->|Yes| Recompile[SmartPlaylistEngine.evaluateRules]
    Recompile --> EmitUpdate[Publish CollectionEventBus: CollectionChanged]
    EmitUpdate --> SchedulerDone([Smart Playlist Cache Refreshed])

    style FindAffected fill:#ffe6cc,stroke:#d79b00
    style Recompile fill:#d5e8d4,stroke:#82b366
```

---

### Process 7: Playlist Import Pipeline (Parsing & Path Resolution)
Parses external playlist files (M3U, M3U8) and transforms relative file paths into normalized, absolute OS paths.

```mermaid
flowchart TD
    M3UStart([M3U / M3U8 File Path]) --> Importer[M3UImporter parses line by line]
    Importer --> ExtractMeta[Extract #EXTINF metadata: title, artist, duration, rawPath]
    ExtractMeta --> ResolvePaths[PlaylistPathResolver resolves absolute system paths]
    ResolvePaths --> VerifyDisk[FilesystemVerifier checks physical existence on disk via FileSystemAccess]
    VerifyDisk --> MatchLib[LibraryResolver queries SQLite library via LibraryLookup]
    MatchLib --> PartitionEntries{Partition Match Results}
    PartitionEntries -->|Path Match| Matched[Status: MATCHED]
    PartitionEntries -->|On Disk but Not In DB| NotInLib[Status: NOT_IN_LIBRARY]
    PartitionEntries -->|File Not on Disk| Missing[Status: MISSING]

    style Matched fill:#d5e8d4,stroke:#82b366
    style NotInLib fill:#ffe6cc,stroke:#d79b00
    style Missing fill:#f8cecc,stroke:#b85450
```

---

### Process 8: Intelligent Repair Strategies (`PlaylistRepairEngine.ts`)
Executes recovery strategies for tracks labeled `NOT_IN_LIBRARY`.

**Strategy Chain**:
1. **`ExactFilenameStrategy`**: Matches library tracks having exact filename equality.
2. **`NormalizedFilenameStrategy`**: Matches after stripping punctuation, track numbers, and case differences.
3. Generates **`RepairDiagnostics`** detailing strategy confidence scores and match provenance.

```mermaid
flowchart TD
    RepairStart([Tracks labeled NOT_IN_LIBRARY]) --> ExactStrat[Strategy 1: ExactFilenameStrategy]
    ExactStrat --> CheckExact{Match Found?}
    CheckExact -->|Yes| SetExactMatch[Set MATCHED with Confidence 1.0]
    CheckExact -->|No| NormStrat[Strategy 2: NormalizedFilenameStrategy]
    NormStrat --> CheckNorm{Fuzzy Match Found?}
    CheckNorm -->|Yes| SetFuzzyMatch[Set MATCHED with Confidence 0.85]
    CheckNorm -->|No| Unresolved[Set Status: UNRESOLVED / SKIP]

    SetExactMatch --> BuildDiagnostics[Build RepairDiagnostics Report]
    SetFuzzyMatch --> BuildDiagnostics
    Unresolved --> BuildDiagnostics
    BuildDiagnostics --> RepairDone([Return Repaired Entries])

    style SetExactMatch fill:#d5e8d4,stroke:#82b366
    style SetFuzzyMatch fill:#ffe6cc,stroke:#d79b00
    style Unresolved fill:#f8cecc,stroke:#b85450
```

---

### Process 9: Import Plan Generation & Transactional Execution
Converts resolved entries into a [`PlaylistImportPlan`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/playlistImport/models/PlaylistImportPlan.ts) for user review before committing writes in a single atomic transaction.

```mermaid
flowchart TD
    PlanStart([Repaired Entries]) --> Planner[PlaylistImportPlanner builds PlaylistImportPlan]
    Planner --> GenStats[Compute statistics: readyCount, skippedCount, matchPercentage]
    GenStats --> UIPreview[Render Preview in React Modal]
    UIPreview --> UserApproval{User Approves Import?}
    UserApproval -->|Cancelled| AbortImport[Discard Session]
    UserApproval -->|Approved| Executor[PlaylistImportExecutor.execute]
    Executor --> BeginTx[BEGIN DB TRANSACTION via TransactionRunner]
    BeginTx --> CreatePl[EnginePlaylistPersistence creates playlist]
    CreatePl --> InsertEntries[Bulk INSERT INTO playlist_entries with positions]
    InsertEntries --> CommitTx[COMMIT DB TRANSACTION]
    CommitTx --> RecordSession[PlaylistImportSessionService marks session COMPLETED]
    RecordSession --> ImportSuccess([Playlist Import Complete])

    style UIPreview fill:#e1f5fe,stroke:#0288d1
    style CommitTx fill:#d5e8d4,stroke:#82b366
    style AbortImport fill:#f8cecc,stroke:#b85450
```

---

### Process 10: Import Session Management & One-Click Undo
Maintains an audit history of imported playlists and enables one-click undo (deleting the imported playlist without losing user songs).

```mermaid
flowchart TD
    SessionStart([Session Initialized]) --> StateDraft[State: DRAFT]
    StateDraft --> StatePlanning[State: PLANNING]
    StatePlanning --> StateExecuting[State: EXECUTING]
    StateExecuting --> StateCompleted[State: COMPLETED with History Audit Record]

    UserUndoImport([User Clicks Undo Import]) --> HistorySvc[PlaylistImportHistoryService.undoImport sessionId]
    HistorySvc --> UndoPersist[PlaylistUndoPersistence deletes created playlist]
    UndoPersist --> MarkUndone[State: UNDONE]
    MarkUndone --> UndoComplete([Playlist Removed & History Preserved])

    style StateCompleted fill:#d5e8d4,stroke:#82b366
    style MarkUndone fill:#fff2cc,stroke:#d6b656
```

---

## 3. Multi-Process Collections & Import Choreography Graph

The following composite flowchart illustrates the interaction between playlists, operations, journaling, and imports:

```mermaid
graph TD
    UserM3U[User Drops M3U Playlist] --> ParsePipeline[Process 7: Parse M3U & Resolve Paths]
    ParsePipeline --> FuzzyRepair[Process 8: Fuzzy Match & Repair Strategies]
    FuzzyRepair --> PlanGen[Process 9: Generate Preview Plan]
    PlanGen --> UserApprove[User Approves Import in Preview Modal]
    UserApprove --> ExecImport[Process 9: Transactional DB Execution]
    ExecImport --> RecordSession[Process 10: Session Audit Log Recorded]

    UserEdit[User Reorders Songs in Playlist] --> OpFramework[Process 1: ReorderOp via OperationExecutor]
    OpFramework --> WriteJournal[Process 1: Journal Forward & Inverse Mutation]
    WriteJournal --> InvalMem[Process 3: Invalidate MembershipCache]
    InvalMem --> EmitEvent[Publish CollectionEventBus: CollectionChanged]
    EmitEvent --> SmartReeval[Process 6: SmartPlaylistScheduler re-evaluates dependent playlists]

    UserCtrlZ[User Presses Undo] --> UndoProcess[Process 2: UndoEngine Pointer Navigation]
    UndoProcess --> RevertMutation[Revert Mutation from Journal]
    RevertMutation --> EmitEvent

    style UserM3U fill:#f5f5f5,stroke:#999999
    style ExecImport fill:#d5e8d4,stroke:#82b366
    style OpFramework fill:#dae8fc,stroke:#6c8ebf
    style UndoProcess fill:#fff2cc,stroke:#d6b656
```
