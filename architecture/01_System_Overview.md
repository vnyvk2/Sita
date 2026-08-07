# 01. System Overview Architecture

This document presents the high-level tier breakdown and subsystem boundaries of Nora's Metadata Platform.

---

## 1. Subsystem Tier Architecture

```mermaid
graph TD
    subgraph Pres ["Presentation Tier (Renderer / UI)"]
        UI[AutoTag Modal / Library Inspector]
    end

    subgraph App ["Application Services Layer"]
        AutoTagSvc(AlbumAutoTagService)
        JobMgr(MetadataJobManager)
        ApplySvc(MetadataApplyService - Retained)
    end

    subgraph PillarB ["Pillar B: Resolution Platform Layer (Encapsulated)"]
        ResMgr(MetadataResolutionManager)
        LookupGW(DefaultMetadataLookupGateway)
        MergeEngine(MetadataMergeEngine)
        MergeSession[MergeSession Snapshot]
    end

    subgraph PillarA ["Pillar A: Provider Infrastructure Layer (100% Resilient)"]
        ProvExec(MetadataProviderExecutor)
        ProvReg{ResolutionProviderRegistry}
        Resilience[/CircuitBreaker, RateLimiter, Retry, Diagnostics/]
    end

    subgraph Adapters ["Data Provider Adapters"]
        MB[[MusicBrainzAdapter]]
        Discogs[[DiscogsAdapter]]
        CAA[[CoverArtArchiveAdapter]]
    end

    subgraph Storage ["Storage & Transaction Layer"]
        TxMgr(MetadataTransactionManager - Coordinator)
        MutExec(MutationExecutor)
        TagWriter(TagWriterService - Disk ID3 Tags)
        DBSync[(LibraryRelationalSyncService - SQLite DB)]
    end

    UI --> AutoTagSvc
    UI --> JobMgr

    AutoTagSvc -->|resolve| ResMgr
    AutoTagSvc -->|executeTransaction| TxMgr
    JobMgr -->|executeTransaction| TxMgr

    ResMgr ==>|owns| LookupGW
    ResMgr ==>|owns| MergeEngine
    ResMgr ==>|owns| MergeSession

    LookupGW --> ProvExec
    ProvExec ==>|owns| ProvReg
    ProvExec ==>|enforces| Resilience

    ProvReg --> MB
    ProvReg --> Discogs
    ProvReg --> CAA

    TxMgr ==>|owns| MutExec
    MutExec --> TagWriter
    MutExec --> DBSync

    style PillarB fill:#dae8fc,stroke:#6c8ebf
    style PillarA fill:#d5e8d4,stroke:#82b366
    style Storage fill:#fff2cc,stroke:#d6b656
```

---

## 2. Invariants & Layering Control Rules

1. **Strict Dependency Order**:
   - `Renderer` $\rightarrow$ `IPC` $\rightarrow$ `AlbumAutoTagService` $\rightarrow$ `MetadataResolutionManager` $\rightarrow$ `DefaultMetadataLookupGateway` $\rightarrow$ `MetadataProviderExecutor` $\rightarrow$ `ResolutionProviderRegistry` $\rightarrow$ `Adapters`.
2. **Merge Engine Encapsulation**:
   - `MetadataMergeEngine` is an internal implementation detail of the Resolution layer and is **never** exposed directly on `MetadataContainer`. Expose only `resolutionManager`.
3. **Resilience Routing Guarantee**:
   - 100% of remote HTTP queries MUST pass through `MetadataProviderExecutor` resilience policies (circuit breakers, rate limiters, retries, timeouts, diagnostics).
