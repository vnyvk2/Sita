# 04. Library Scanner & Asynchronous Builder Architecture

This document provides a comprehensive technical specification of Nora's **Library Ingestion and Asynchronous Asset Processing Subsystem**. It details every individual process, data structure, mathematical invariant, and inter-process choreography.

---

## 1. High-Level Subsystem Architecture

The Library Subsystem decouples fast, synchronous metadata ingestion from expensive, background derived-asset generation.

```mermaid
graph TD
    subgraph FilesystemTier ["Physical Storage Tier"]
        DiskAudio[(Audio Files on Disk: MP3, FLAC, M4A, OGG, WAV, AAC)]
        Watchers[/Passive File Watchers/]
    end

    subgraph ScannerTier ["Scanner & Reconciler Tier"]
        Controller(LibraryLifecycleController)
        Scanner(LibraryScanner)
        DiffEngine{diffFilesystemSnapshot}
        Reconciler(LibraryReconciler)
        Hierarchy(folderHierarchy)
        WorkerPool[/Bounded Worker Pool: 16 Workers/]
    end

    subgraph StorageTier ["Relational Persistence Tier"]
        DB[(Drizzle SQLite DB: songs, albums, artists, music_folders)]
    end

    subgraph SchedulerTier ["Asynchronous Asset Builder Tier"]
        Scheduler[/JobScheduler: Interactive, Background, Maintenance/]
        ArtWorker[/ArtworkJob: Sharp Extractor/]
        PalWorker[/PaletteJob: Color Quantizer/]
        WaveWorker[/WaveformJob: Audio Peak Synthesizer/]
        LrcWorker[/LyricsJob: Embedded & Net Parser/]
        RGWorker[/ReplayGainJob: Loudness Analyzer/]
        GCWorker[/GarbageCollectionJob: Orphan Cleaner/]
    end

    Watchers --> Controller
    Controller --> Scanner
    Scanner --> DiffEngine
    DiffEngine --> Reconciler
    Reconciler --> Hierarchy
    Reconciler --> WorkerPool
    WorkerPool --> DB

    DB --> Scheduler
    Scheduler ==> ArtWorker
    Scheduler ==> PalWorker
    Scheduler ==> WaveWorker
    Scheduler ==> LrcWorker
    Scheduler ==> RGWorker
    Scheduler ==> GCWorker

    ArtWorker ==>|ARTWORK_READY event| PalWorker

    style ScannerTier fill:#dae8fc,stroke:#6c8ebf
    style StorageTier fill:#fff2cc,stroke:#d6b656
    style SchedulerTier fill:#d5e8d4,stroke:#82b366
    style FilesystemTier fill:#f5f5f5,stroke:#999999
```

---

## 2. Detailed Process Breakdown

### Process 1: Scan Root Discovery & Accessibility Probing

Before touching the filesystem, the scanner loads all configured root music folders from the database and probes each path for physical accessibility.

**Detailed Workflow**:

1. Invokes [`getLibraryScanRoots()`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/library/getLibraryScanRoots.ts) to retrieve root folder entries from `music_folders WHERE parent_id IS NULL`.
2. Probes each path with `fs.access()`.
3. If accessible, adds root to `accessibleRoots`.
4. If inaccessible (e.g. disconnected USB drive, unmounted network share), adds root to `skippedRoots`.
5. **Safety Invariant**: Songs under `skippedRoots` are strictly protected from deletion during subsequent diffing.

```mermaid
flowchart TD
    Start([Start Root Discovery]) --> FetchRoots[Query DB for Root Music Folders]
    FetchRoots --> LoopRoots{Iterate Each Root}
    LoopRoots -->|Next Root| TestAccess[fs.access root.path]
    TestAccess -->|Accessible| AddAccessible[Add to accessibleRoots]
    TestAccess -->|Inaccessible / Disconnected| AddSkipped[Add to skippedRoots & Warn]
    AddAccessible --> LoopRoots
    AddSkipped --> LoopRoots
    LoopRoots -->|Complete| EmitProgress[Emit ScannerState: DISCOVERING]
    EmitProgress --> End([Proceed to Fast Disk Walk])

    style AddAccessible fill:#d5e8d4,stroke:#82b366
    style AddSkipped fill:#f8cecc,stroke:#b85450
```

---

### Process 2: Fast Single-Pass Disk Traversal (`fastDiskWalk.ts`)

Performs high-throughput, recursive disk traversal across accessible roots with built-in subtree error containment.

**Detailed Workflow**:

1. Traverses directories recursively using Node `fs.readdir(path, { withFileTypes: true })`.
2. Gathers file entries matching supported extensions (`.mp3`, `.flac`, `.m4a`, `.ogg`, `.opus`, `.wav`, `.aac`, `.m4r`).
3. Captures individual file `mtimeMs` and `size` via `fs.stat()`.
4. **Subtree Failure Protection**: If `readdir` fails on a nested folder (permissions or I/O error), records directory in `failedSubtrees` and continues scanning sibling folders safely.
5. **Stat Failure Protection**: If `fs.stat` fails on an individual file, records path in `failedPaths` and continues.
6. Emits throttling discovery progress to UI (`discoveredFiles`, `currentPath`).

```mermaid
flowchart TD
    WalkStart([Receive accessibleRoots]) --> DirQueue[Enqueue Root Directories]
    DirQueue --> ReadDir[fs.readdir with withFileTypes]
    ReadDir -->|Directory Error| RecordFailedSubtree[Record in failedSubtrees & Isolate]
    ReadDir -->|Success| InspectEntries[Inspect Directory Entries]
    InspectEntries --> SplitEntries{Entry Type?}
    SplitEntries -->|Directory| EnqueueChild[Enqueue Subdirectory]
    SplitEntries -->|Audio File| StatFile[fs.stat file]
    SplitEntries -->|Ignored File| SkipFile[Skip non-audio file]
    StatFile -->|Stat Error| RecordFailedStat[Record in failedPaths]
    StatFile -->|Success| CreateSnapshot[Create DiskSongSnapshot]
    EnqueueChild --> DirQueue
    CreateSnapshot --> AggregateSnapshots[Collect in diskSnapshots]
    RecordFailedSubtree --> DirQueue
    RecordFailedStat --> DirQueue
    AggregateSnapshots --> WalkEnd([Produce Disk Snapshots Result])

    style RecordFailedSubtree fill:#f8cecc,stroke:#b85450
    style RecordFailedStat fill:#f8cecc,stroke:#b85450
    style CreateSnapshot fill:#d5e8d4,stroke:#82b366
```

---

### Process 3: Pure In-Memory Snapshot Diffing (`diffEngine.ts`)

Computes the exact delta (`added`, `modified`, `removed`, `unchanged`) between the physical filesystem and the database.

**Mathematical Tolerance Rule**:

$$
\begin{aligned}
|t_{\text{disk}} - t_{\text{db}}| \le 1000\text{ms} &\implies \text{UNCHANGED} \\
t_{\text{disk}} > t_{\text{db}} + 1000\text{ms} &\implies \text{MODIFIED} \\
t_{\text{disk}} < t_{\text{db}} - 1000\text{ms} &\implies \text{UNCHANGED (Preserves FAT32/exFAT rounding)}
\end{aligned}
$$

**Removed Boundary Protections**:
A database record is marked `removed` ONLY IF:

1. It does not exist in `diskSnapshots`.
2. It is NOT inside any `skippedRoots`.
3. It is NOT inside any `failedSubtrees`.
4. It is NOT in `failedPaths`.
5. It belongs to a currently accessible root.
6. It is NOT marked `isBlacklisted`.

```mermaid
flowchart TD
    DiffStart([Disk & DB Snapshots]) --> BuildMaps[Build Normalized Path Maps with pathKey]
    BuildMaps --> EvalDisk[Evaluate Disk Snapshots]
    EvalDisk --> CheckInDB{Path in DB?}
    CheckInDB -->|No| PushAdded[Push to added]
    CheckInDB -->|Yes & Blacklisted| IncUnchangedB[Increment unchangedCount]
    CheckInDB -->|Yes| CheckTime{diskTime - dbTime > 1000ms?}
    CheckTime -->|Yes| PushMod[Push to modified]
    CheckTime -->|No| IncUnchanged[Increment unchangedCount]

    PushAdded --> EvalDB[Evaluate DB Songs]
    PushMod --> EvalDB
    IncUnchanged --> EvalDB
    IncUnchangedB --> EvalDB

    EvalDB --> InDisk{Path on Disk?}
    InDisk -->|Yes| NextDB[Skip]
    InDisk -->|No| CheckFailedPath{In failedPaths?}
    CheckFailedPath -->|Yes| NextDB
    CheckFailedPath -->|No| CheckSkippedRoot{Under skippedRoot?}
    CheckSkippedRoot -->|Yes| NextDB
    CheckSkippedRoot -->|No| CheckFailedSubtree{Under failedSubtree?}
    CheckFailedSubtree -->|Yes| NextDB
    CheckFailedSubtree -->|No| CheckAccessibleRoot{Under accessibleRoot?}
    CheckAccessibleRoot -->|Yes| PushRemoved[Push to removed]
    CheckAccessibleRoot -->|No| NextDB

    PushRemoved --> DiffDone([Return DiffResult])

    style PushAdded fill:#d5e8d4,stroke:#82b366
    style PushMod fill:#ffe6cc,stroke:#d79b00
    style PushRemoved fill:#f8cecc,stroke:#b85450
```

---

### Process 4: Folder Hierarchy Pre-Allocation (`folderHierarchy.ts`)

Before ingesting tracks into the database, the reconciler ensures all parent folder structures exist in `music_folders` to enforce immediate foreign key relations.

**Detailed Workflow**:

1. Extracts all unique parent directory paths for newly added songs.
2. Identifies missing folder records in the database.
3. Recursively inserts missing directory nodes from root downward, establishing correct `parentId` relationships.
4. Returns a fast memory map `Map<dirPathKey, folderId>`.

```mermaid
flowchart TD
    HierStart([Unique Directories from Added Songs]) --> NormalizeDirs[Normalize paths for OS win32/posix]
    NormalizeDirs --> QueryExisting[Select existing music_folders]
    QueryExisting --> IdentifyMissing[Identify Unrecorded Parent Paths]
    IdentifyMissing --> SortDepth[Sort Directory Paths by Depth]
    SortDepth --> InsertLoop{Iterate Sorted Paths}
    InsertLoop -->|Next Path| ResolveParent[Resolve Parent Directory folderId]
    ResolveParent --> InsertFolder[INSERT INTO music_folders]
    InsertFolder --> CacheMap[Store in folderMap: pathKey -> folderId]
    CacheMap --> InsertLoop
    InsertLoop -->|Done| HierEnd([Return Complete folderMap])

    style InsertFolder fill:#d5e8d4,stroke:#82b366
```

---

### Process 5: Bounded Concurrency Song Ingestion (`songWorkerPool.ts`)

Ingests newly discovered audio tracks into SQLite using a bounded worker pool (up to 16 concurrent workers).

**Detailed Workflow**:

1. Assigns each track its pre-resolved `folderId`.
2. Worker reads audio file metadata using TagLib / `parseSong.ts` (title, artists, album, track number, disk number, year, duration, bitrate, sample rate).
3. Inserts or links `artists`, `albums`, `genres` junction records.
4. Commits song record inside a dedicated short database transaction.
5. Emits `SongAdded` event and triggers derived asset queuing.

```mermaid
flowchart TD
    IngestStart([Eligible Songs + folderMap]) --> DispatchPool[Dispatch to Worker Pool: 16 Workers]
    DispatchPool --> WorkerLoop{For each song}
    WorkerLoop --> ReadTagLib[Extract ID3 Metadata with TagLib]
    ReadTagLib --> BeginTx[BEGIN DB TRANSACTION]
    BeginTx --> UpsertArtists[Link / Insert Artists]
    UpsertArtists --> UpsertAlbum[Link / Insert Album]
    UpsertAlbum --> UpsertGenre[Link / Insert Genres]
    UpsertGenre --> InsertSong[INSERT INTO songs with folderId]
    InsertSong --> CommitTx[COMMIT DB TRANSACTION]
    CommitTx --> EmitEvent[Publish LibraryEvent: SongAdded]
    EmitEvent --> WorkerLoop
    WorkerLoop -->|All Done| IngestEnd([Return ReconcileResult])

    style CommitTx fill:#d5e8d4,stroke:#82b366
    style ReadTagLib fill:#dae8fc,stroke:#6c8ebf
```

---

### Process 6: Modified Track Re-parsing (`reParseSong.ts`)

When file modification timestamps exceed tolerance ($> 1000\text{ms}$), the reconciler updates metadata in-place.

**Detailed Workflow**:

1. Re-reads physical file tags via TagLib.
2. Compares extracted tags against current database fields.
3. Updates `songs` record, updates `fileModifiedAt`, and synchronizes many-to-many artist/album/genre relations.
4. Emits `SongMetadataChanged` event on [`LibraryEventBus`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/events/LibraryEventBus.ts).

```mermaid
flowchart TD
    ModStart([Modified Song Path]) --> TagLibRead[Re-read ID3 Tags via TagLib]
    TagLibRead --> DiffTags{Tags Changed?}
    DiffTags -->|No| UpdateMtime[UPDATE songs SET file_modified_at]
    DiffTags -->|Yes| UpdateSongDB[UPDATE songs & Synchronize Junctions]
    UpdateSongDB --> InvalCache[Invalidate Metadata & Search Caches]
    InvalCache --> EmitChange[Publish LibraryEvent: SongMetadataChanged]
    UpdateMtime --> ModEnd([Re-parse Complete])
    EmitChange --> ModEnd

    style UpdateSongDB fill:#ffe6cc,stroke:#d79b00
```

---

### Process 7: Batch Track Removal (`removeSongsFromLibrary.ts`)

Removes unlinked tracks in chunks of 500 records.

**Detailed Workflow**:

1. Takes list of removed database song IDs.
2. Removes dependent records in cascade order (`artworks_songs`, `artists_songs`, `album_songs`, `genres_songs`, `playlist_entries`, `play_history`).
3. Deletes `songs` record.
4. Performs orphan pruning on empty artists and albums.
5. Emits `SongRemoved` events.

```mermaid
flowchart TD
    RemStart([Removed Song Paths / IDs]) --> ChunkPaths[Slice into 500-item Chunks]
    ChunkPaths --> BeginDelTx[BEGIN TRANSACTION]
    BeginDelTx --> DeleteJunctions[DELETE FROM artworks_songs, artists_songs, ...]
    DeleteJunctions --> DeleteSongs[DELETE FROM songs WHERE id IN chunk]
    DeleteSongs --> PruneOrphans[Prune Empty Artists & Albums]
    PruneOrphans --> CommitDelTx[COMMIT TRANSACTION]
    CommitDelTx --> EmitDelEvents[Publish LibraryEvent: SongRemoved]
    EmitDelEvents --> RemEnd([Removal Complete])

    style CommitDelTx fill:#f8cecc,stroke:#b85450
```

---

### Process 8: Lifecycle Control & Debounced Change Tracking

The [`LibraryLifecycleController`](file:///C:/Users/VINAY/.gemini/antigravity/worktrees/Nora/document_project_architecture_graphs/src/main/library/LibraryLifecycleController.ts) coordinates background scans, scan modes, and watcher debounce cycles.

**Debounce & Generation Tracking**:

- Watcher events increment `changeGeneration`.
- Debounces trigger for `2000ms`.
- If a scan is currently active when a change occurs, the controller waits for completion and schedules an automatic follow-up scan.

```mermaid
flowchart TD
    EventArrive([Filesystem Watcher Event]) --> IncGen[changeGeneration += 1]
    IncGen --> ResetTimer[Clear & Reset Debounce Timer: 2000ms]
    ResetTimer --> TimerExpire{Debounce Timer Expired?}
    TimerExpire -->|Yes| CheckInFlight{Scan in Flight?}
    CheckInFlight -->|Yes| ScheduleFollowUp[Flag Follow-up Required]
    CheckInFlight -->|No| ExecScan[Execute scanNow scanGeneration]
    ExecScan --> ScanFinished{Scan Completed}
    ScanFinished --> CheckGenDiff{Current Gen != Start Gen?}
    CheckGenDiff -->|Yes| ExecFollowUp[Execute Follow-up Background Scan]
    CheckGenDiff -->|No| RecordSuccess[Record user_settings.lastScanTime]
    ScheduleFollowUp --> ScanFinished
    RecordSuccess --> IdleState([Scanner IDLE])

    style ExecScan fill:#dae8fc,stroke:#6c8ebf
    style ExecFollowUp fill:#ffe6cc,stroke:#d79b00
```

---

### Process 9: 3-Tier Job Scheduler (`jobScheduler.ts`)

Manages background CPU-intensive tasks using 3 strict priority queues:

1. **`interactive`** (Concurrency: 4) — User-triggered or high-priority viewport requests (e.g. user scrolled to album).
2. **`background`** (Concurrency: 2) — Batch derived asset generators (palettes, waveforms, lyrics, replay gain).
3. **`maintenance`** (Concurrency: 1) — Periodic garbage collection and integrity checks.

```mermaid
flowchart TD
    JobEnqueue([Job Enqueued]) --> CheckDup{Active Job ID Set?}
    CheckDup -->|Already Active| RejectDup[Reject Duplicate Job]
    CheckDup -->|New Job| SelectQueue{Job Class?}
    SelectQueue -->|interactive| PushInt[Push to interactiveQueue]
    SelectQueue -->|background| PushBg[Push to backgroundQueue]
    SelectQueue -->|maintenance| PushMaint[Push to maintenanceQueue]

    PushInt --> DispatchLoop[processNext Scheduler Loop]
    PushBg --> DispatchLoop
    PushMaint --> DispatchLoop

    DispatchLoop --> CheckRunning{Check Running Count vs Limits}
    CheckRunning -->|interactive < 4| RunInt[Shift & Start Interactive Job]
    CheckRunning -->|background < 2| RunBg[Shift & Start Background Job]
    CheckRunning -->|maintenance < 1| RunMaint[Shift & Start Maintenance Job]

    RunInt --> JobExec[Execute Job & Measure Latency]
    RunBg --> JobExec
    RunMaint --> JobExec

    JobExec --> JobDone{Success or Fail?}
    JobDone -->|Success| CompleteJob[Emit JOB_COMPLETED & Clear Active ID]
    JobDone -->|Fail & Retries < 3| ReEnqueue[Increment Retries & Re-enqueue]
    JobDone -->|Fail & Retries >= 3| MarkFailed[Push to failedJobsList & Emit JOB_FAILED]

    CompleteJob --> DispatchLoop
    ReEnqueue --> DispatchLoop
    MarkFailed --> DispatchLoop

    style RunInt fill:#d5e8d4,stroke:#82b366
    style RunBg fill:#dae8fc,stroke:#6c8ebf
    style RunMaint fill:#fff2cc,stroke:#d6b656
```

---

### Process 10: Derived Asset Job Execution & Event Choreography

Derived asset jobs are executed asynchronously without blocking the user interface:

```mermaid
flowchart TD
    subgraph Job1 ["Artwork Job"]
        J1_Start[ArtworkJob: Extract Sample File Image] --> J1_Sharp[Sharp Resize & Deduplicate Hash]
        J1_Sharp --> J1_DB[INSERT INTO artworks & Link albums/songs]
        J1_DB --> J1_Emit[Emit Event: ARTWORK_READY]
    end

    subgraph Job2 ["Palette Job (Choreographed)"]
        J1_Emit --> J2_Start[libraryChoreography intercepts ARTWORK_READY]
        J2_Start --> J2_Queue[Enqueue PaletteJob]
        J2_Queue --> J2_Quantize[Vibrant Color Quantization]
        J2_Quantize --> J2_DB[INSERT INTO palettes & palette_swatches]
        J2_DB --> J2_Emit[Emit Event: PALETTE_READY]
    end

    subgraph Job3 ["Waveform Job"]
        J3_Start[WaveformJob: Decode Audio Buffer] --> J3_Peak[Synthesize Peak Visual Buffer]
        J3_Peak --> J3_DB[INSERT INTO waveforms]
        J3_DB --> J3_Emit[Emit Event: WAVEFORM_READY]
    end

    subgraph Job4 ["Lyrics Job"]
        J4_Start[LyricsJob: Parse ID3 USLT / SYLT / Net LRC] --> J4_DB[INSERT INTO lyrics]
        J4_DB --> J4_Emit[Emit Event: LYRICS_READY]
    end

    style Job1 fill:#dae8fc,stroke:#6c8ebf
    style Job2 fill:#ffe6cc,stroke:#d79b00
    style Job3 fill:#d5e8d4,stroke:#82b366
    style Job4 fill:#e1d5e7,stroke:#9673a6
```

---

## 3. Inter-Process Group Choreography Graph

The following composite flowchart illustrates the complete lifecycle from file drop to background enrichment:

```mermaid
graph TD
    UserDrop[User Drops Audio Files into Music Folder] --> WatcherEvt[Passive Watcher Detects Creation]
    WatcherEvt --> Debounce[Debounced Change Generation Tracking]
    Debounce --> Discover[Process 1 & 2: Root Health & Fast Disk Walk]
    Discover --> Diff[Process 3: Pure In-Memory Snapshot Diffing]
    Diff --> Hierarchy[Process 4: Folder Hierarchy Pre-Allocation]
    Hierarchy --> Ingestion[Process 5: Bounded Worker Pool Song Ingestion]
    Ingestion --> DBCommit[(SQLite DB Commit - Library Immediately Usable)]
    DBCommit --> UIRefresh[UI Queries Updated via TanStack Query]
    DBCommit --> EnqueueArt[Queue Background ArtworkJob]
    EnqueueArt --> ExecArt[Process 10: Artwork Extraction & Sharp Deduplication]
    ExecArt --> ArtDone[Publish ARTWORK_READY]
    ArtDone --> EnqueuePal[Choreography Enqueues PaletteJob]
    EnqueuePal --> ExecPal[Color Swatch Generation]
    ExecPal --> UIAsset[UI Live Animated Reveal of Artwork & Palette]

    style UserDrop fill:#f5f5f5,stroke:#999999
    style Ingestion fill:#dae8fc,stroke:#6c8ebf
    style DBCommit fill:#d5e8d4,stroke:#82b366
    style UIAsset fill:#ffe6cc,stroke:#d79b00
```
