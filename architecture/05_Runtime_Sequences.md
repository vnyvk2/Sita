# 05. Multi-Subsystem Runtime Sequence Diagrams

This document illustrates the end-to-end runtime execution sequences for core workflows across all Nora subsystems.

---

## 1. Full Library Scan & Reconciliation Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Watcher
    participant Controller as LibraryLifecycleController
    participant Scanner as LibraryScanner
    participant Walker as fastDiskWalk
    participant Diff as diffFilesystemSnapshot
    participant Reconciler as LibraryReconciler
    participant Hierarchy as folderHierarchy
    participant Pool as songWorkerPool
    participant DB as SQLite DB
    participant Scheduler as JobScheduler
    participant UI as React UI

    User->>Controller: scanNow() / debounced watcher trigger
    Controller->>Scanner: scan({ dryRun: false })
    Scanner->>Scanner: setState('DISCOVERING')
    Scanner->>Walker: fastDiskWalk(accessibleRoots)
    Walker-->>Scanner: { diskSnapshots, failedSubtrees, failedPaths }

    Scanner->>Scanner: setState('DIFFING')
    Scanner->>DB: fetch flat dbSongs snapshot
    DB-->>Scanner: dbSnapshots
    Scanner->>Diff: diffFilesystemSnapshot(disk, db, roots)
    Diff-->>Scanner: DiffResult { added, modified, removed, unchanged }

    Scanner->>Scanner: setState('RECONCILING')

    alt Removed Tracks Exist
        Scanner->>Reconciler: reconcileRemoved(removed)
        Reconciler->>DB: batch DELETE FROM songs
    end

    alt Added Tracks Exist
        Scanner->>Reconciler: reconcileAdded(added, roots)
        Reconciler->>Hierarchy: resolveOrCreateMusicFolders()
        Hierarchy->>DB: INSERT missing music_folders
        Hierarchy-->>Reconciler: folderMap
        Reconciler->>Pool: processSongsWithWorkerPool(eligibleSongs)
        loop 16 Workers
            Pool->>DB: INSERT INTO songs, artists_songs, album_songs
        end
        Pool-->>Reconciler: Ingestion OK
    end

    alt Modified Tracks Exist
        Scanner->>Reconciler: reconcileModified(modified)
        loop 8 Workers
            Reconciler->>DB: UPDATE songs & junction tags
        end
    end

    Scanner->>Scheduler: Enqueue Background Asset Jobs (Artwork, Palette)
    Scanner-->>Controller: ScanSummary { added, modified, removed }
    Controller->>DB: saveUserSettings({ lastScanTime })
    Controller-->>UI: IPC progress & completion events
```

---

## 2. AutoTag Multi-Provider Resolution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / UI
    participant IPC as IPC Layer
    participant AutoTag as AlbumAutoTagService
    participant ResMgr as MetadataResolutionManager
    participant Lookup as DefaultMetadataLookupGateway
    participant Exec as MetadataProviderExecutor
    participant MB as MusicBrainzAdapter
    participant Discogs as DiscogsAdapter
    participant CAA as CoverArtArchiveAdapter
    participant Merge as MetadataMergeEngine

    User->>IPC: invoke("metadata/searchAlbums", { albumName, artistName })
    IPC->>AutoTag: searchReleases(albumName, artistName)
    AutoTag->>ResMgr: resolve(operationId, context)
    ResMgr->>Lookup: searchCandidates(context)
    Lookup->>Exec: executeConcurrent(query)

    par Federated Provider Queries
        Exec->>MB: searchReleases(query)
        Exec->>Discogs: searchReleases(query)
        Exec->>CAA: fetchCoverArt(query)
    end

    MB-->>Exec: Track list & MBID metadata
    Discogs-->>Exec: Master release genres & styles
    CAA-->>Exec: High-res front/back artwork URLs

    Exec-->>Lookup: Federated Raw Contributions
    Lookup->>Merge: mergeFieldContributions(contributions)
    Merge-->>ResMgr: Merged Candidate Snapshot (with Attribution Badges)
    ResMgr-->>AutoTag: MetadataResolution Result
    AutoTag-->>IPC: AlbumMetadata[] Results
    IPC-->>User: Render Candidate Release List
```

---

## 3. Metadata Apply & Atomic Rollback Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / UI
    participant IPC as IPC Layer
    participant AutoTag as AlbumAutoTagService
    participant TxMgr as MetadataTransactionManager
    participant Downloader as ArtworkDownloaderService
    participant MutExec as MutationExecutor
    participant TagWriter as TagWriterService
    participant DBSync as LibraryRelationalSyncService
    participant History as MetadataHistoryService

    User->>IPC: invoke("metadata/applyPreview", { preview, options })
    IPC->>AutoTag: applyPreview(preview, options)
    AutoTag->>TxMgr: executeTransaction(operationId, mutations, options)

    opt Artwork Replacement Requested
        TxMgr->>Downloader: fetchAndValidateArtwork(artworkUrl)
        Downloader-->>TxMgr: artworkBuffer
    end

    loop 50-Item Chunks
        TxMgr->>MutExec: executeSingleMutation(songId, filePath, tagPayload)
        MutExec->>TagWriter: writeBatch([{ filePath, tags }])
        TagWriter-->>MutExec: ID3 Disk Write OK
        MutExec->>DBSync: syncRelationalDatabase(songId, filePath, fieldMap)
        DBSync-->>MutExec: SQLite DB Sync OK
        MutExec-->>TxMgr: Mutation Result OK
        TxMgr->>TxMgr: push draftSnapshot (Pre-transaction state)
    end

    alt Mutation or I/O Error Occurred
        TxMgr->>MutExec: rollbackDraftSnapshots(reverse order)
        MutExec->>TagWriter: Revert Pre-Transaction Tags
        MutExec->>DBSync: Revert Pre-Transaction DB State
        TxMgr-->>AutoTag: TransactionResult { success: false, rolledBack: true }
    else Transaction Succeeded
        TxMgr->>History: pushSnapshot(historySnapshot with UndoToken)
        TxMgr-->>AutoTag: TransactionResult { success: true, updatedCount }
    end

    AutoTag-->>IPC: ApplyResult
    IPC-->>User: Render Notification / Refresh UI
```

---

## 4. Playback Queue Permutation & Shuffled Advance Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Playback Action
    participant Client as QueuesManager / PlayerQueue
    participant Engine as QueueEngine
    participant Audio as Howler / Web Audio API
    participant Store as Zustand Store / LocalStorage

    User->>Client: playSong(songId) or toggleShuffle()
    Client->>Engine: toggleShuffle() / replaceQueue(songIds)
    Engine->>Engine: recomputeShuffle() (Fisher-Yates with Active Track at Index 0)
    Engine-->>Client: Updated QueueState { shufflePermutation, currentEntryId }
    Client->>Audio: load & play songIds[shufflePermutation[0]]
    Client->>Store: triggerStoreSync() (persists structureVersion & position)

    Note over User,Audio: Track finishes playing naturally
    Audio->>Client: 'onended' event fired
    Client->>Engine: advance()
    Engine->>Engine: nextPlayback = currentPlayback + 1
    Engine->>Engine: resolve entries[shufflePermutation[nextPlayback]]
    Engine->>Engine: history.push(previousEntryId)
    Engine-->>Client: Updated position & currentEntryId
    Client->>Audio: play next song
    Client->>Store: triggerStoreSync()
```

---

## 5. Playlist Mutation, Inverse Journaling & Undo Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / UI
    participant Client as CollectionClient (Renderer)
    participant IPC as setupCollectionIpc
    participant Engine as PlaylistEngine
    participant OpExec as OperationExecutor
    participant Op as AddSongsOp
    participant Repo as PlaylistRepository
    participant Journal as OperationJournalRepository
    participant Undo as UndoEngine
    participant Bus as CollectionEventBus

    User->>Client: addSongsToPlaylist(playlistId, songIds)
    Client->>IPC: invoke('collections/write/addSongs')
    IPC->>Engine: addSongs({ playlistId, songIds })
    Engine->>OpExec: execute(AddSongsOp, input, ctx)
    OpExec->>Op: execute(input, ctx)
    Op->>Repo: INSERT INTO playlist_entries
    Op->>Op: computeInverse(input) -> RemoveSongsInput
    Op-->>OpExec: OperationResult { data, inverseInput }
    OpExec->>Journal: INSERT INTO operation_journal (forward & inverse data)
    OpExec-->>Engine: Execution Success
    Engine->>Bus: emitEvent('CollectionChanged')
    Bus-->>Client: Push IPC Event to Renderer
    Client-->>User: Invalidate Queries & Render Updated Playlist

    Note over User,Undo: User presses Ctrl+Z (Undo)
    User->>Client: undo(collectionId)
    Client->>IPC: invoke('collections/undo')
    IPC->>Undo: undo(collectionId)
    Undo->>Journal: Read inverseInput at current sequence pointer
    Undo->>OpExec: execute(RemoveSongsOp, inverseInput)
    OpExec->>Repo: DELETE FROM playlist_entries
    Undo->>Undo: Decrement sequence pointer (-1)
    Undo->>Bus: emitEvent('CollectionChanged')
    Bus-->>Client: Refresh UI
```

---

## 6. Global Federated Search & Batched Hydration Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / Search Input
    participant UI as SearchPage (Renderer)
    participant IPC as Main IPC
    participant Coord as SearchCoordinator
    participant SongEng as SongSearchEngine
    participant AlbumEng as AlbumSearchEngine
    participant ArtistEng as ArtistSearchEngine
    participant PlaylistEng as PlaylistSearchEngine
    participant GenreEng as GenreSearchEngine
    participant Gateway as MetadataSearchGateway
    participant DB as SQLite DB

    User->>UI: Types "stairway"
    UI->>IPC: invoke("search/query", { keyword: "stairway", filter: "All" })
    IPC->>Coord: query(options)
    Coord->>Coord: normalizeQuery("stairway")

    par Parallel Search Engine Execution
        Coord->>SongEng: search(query) -> SearchMatchReference[]
        Coord->>AlbumEng: search(query) -> SearchMatchReference[]
        Coord->>ArtistEng: search(query) -> SearchMatchReference[]
        Coord->>PlaylistEng: search(query) -> SearchMatchReference[]
        Coord->>GenreEng: search(query) -> SearchMatchReference[]
    end

    SongEng-->>Coord: songRefs (with MatchTier: EXACT / PREFIX / TRIGRAM)
    AlbumEng-->>Coord: albumRefs
    ArtistEng-->>Coord: artistRefs
    PlaylistEng-->>Coord: playlistRefs
    GenreEng-->>Coord: genreRefs

    Coord->>Gateway: hydrateReferences(allReferences in 1 batched pass)
    Gateway->>DB: SELECT joined songs, albums, artists, artworks
    DB-->>Gateway: Raw DB Rows
    Gateway-->>Coord: Hydrated DTOs (SongData[], Album[], Artist[])

    Coord->>Coord: Partition into sections & compute confidence scores
    Coord-->>IPC: SearchResult { songs, albums, artists, playlists, genres, confidence }
    IPC-->>UI: Render Classified Search Results
```
