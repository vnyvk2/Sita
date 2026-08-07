# 05. Runtime Sequence Diagrams

This document illustrates the exact execution sequence for major user workflows in the Metadata Platform.

---

## 1. AutoTag Search Runtime Sequence

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
    
    par Query Providers
        Exec->>MB: searchReleases(query)
        Exec->>Discogs: searchReleases(query)
        Exec->>CAA: fetchCoverArt(query)
    end

    MB-->>Exec: MusicBrainz Contributions
    Discogs-->>Exec: Discogs Contributions
    CAA-->>Exec: Cover Art Contributions

    Exec-->>Lookup: Federated Raw Contributions
    Lookup->>Merge: mergeFieldContributions(contributions)
    Merge-->>ResMgr: Merged Candidate Snapshot
    ResMgr-->>AutoTag: MetadataResolution Result
    AutoTag-->>IPC: AlbumMetadata[] Results
    IPC-->>User: Render Candidate Release List
```

---

## 2. AutoTag Apply & Transaction Runtime Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as User / UI
    participant IPC as IPC Layer
    participant AutoTag as AlbumAutoTagService
    participant TxMgr as MetadataTransactionManager
    participant MutExec as MutationExecutor
    participant TagWriter as TagWriterService
    participant DBSync as LibraryRelationalSyncService
    participant History as MetadataHistoryService

    User->>IPC: invoke("metadata/applyPreview", { preview, options })
    IPC->>AutoTag: applyPreview(preview, options)
    AutoTag->>TxMgr: executeTransaction(operationId, mutations, options)
    
    loop 50-Item Chunks
        TxMgr->>MutExec: executeSingleMutation(songId, filePath, tagPayload)
        MutExec->>TagWriter: writeBatch([{ filePath, tags }])
        TagWriter-->>MutExec: ID3 Disk Write Success
        MutExec->>DBSync: syncRelationalDatabase(songId, filePath, fieldMap)
        DBSync-->>MutExec: SQLite DB Sync Success
        MutExec-->>TxMgr: Mutation Result OK
    end

    TxMgr->>History: pushSnapshot(historySnapshot)
    TxMgr-->>AutoTag: TransactionResult { success: true, updatedCount }
    AutoTag-->>IPC: ApplyResult
    IPC-->>User: Render Success Notification
```
