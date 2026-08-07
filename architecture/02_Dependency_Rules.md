# 02. Dependency Rules & Ownership Graph

This document details the dependency rules (allowed vs. forbidden calls) and structural ownership hierarchies within Nora's Metadata Platform.

---

## 1. Allowed vs. Forbidden Dependency Hierarchy

```mermaid
graph TD
    subgraph Layers ["Layer Hierarchy (Top to Bottom)"]
        UI[Presentation / Renderer]
        IPC[IPC Layer]
        AppSvc[Application Services Layer]
        ResPlatform[Resolution Platform Layer]
        ProvInfra[Provider Infrastructure Layer]
        StorageTx[Storage & Transaction Layer]
    end

    UI -->|allowed| IPC
    IPC -->|allowed| AppSvc
    AppSvc -->|allowed| ResPlatform
    AppSvc -->|allowed| StorageTx
    ResPlatform -->|allowed| ProvInfra

    UI x-- FORBIDDEN --x AppSvc
    UI x-- FORBIDDEN --x StorageTx
    ProvInfra x-- FORBIDDEN --x StorageTx
    StorageTx x-- FORBIDDEN --x ResPlatform

    style UI fill:#f5f5f5,stroke:#d6b656
    style AppSvc fill:#dae8fc,stroke:#6c8ebf
    style ResPlatform fill:#d5e8d4,stroke:#82b366
    style StorageTx fill:#fff2cc,stroke:#d6b656
```

### Forbidden Dependency Summary
1. **Providers MUST NOT Access Storage**: Data provider adapters (`MusicBrainzAdapter`, `DiscogsAdapter`) must never call SQLite databases or Tag Writers directly.
2. **Transactions MUST NOT Invoke Resolution**: `MetadataTransactionManager` coordinates writes; it never queries resolution managers.
3. **Renderer MUST NOT Access Services**: The frontend renderer communicates exclusively through IPC channels.

---

## 2. Ownership / Structural Composition Hierarchy

Ownership defines object lifetimes and composition parentage (which entity creates and holds references to child objects).

```mermaid
graph TD
    Bootstrap[MetadataBootstrap] ==>|owns| Container[MetadataContainer]

    Container ==>|owns| ResMgr(MetadataResolutionManager)
    Container ==>|owns| TxMgr(MetadataTransactionManager)
    Container ==>|owns| AutoTagSvc(AlbumAutoTagService)

    ResMgr ==>|owns| LookupGW(DefaultMetadataLookupGateway)
    ResMgr ==>|owns| MergeEngine(MetadataMergeEngine)

    LookupGW ==>|owns| ProvExec(MetadataProviderExecutor)
    ProvExec ==>|owns| ResReg{ResolutionProviderRegistry}

    TxMgr ==>|owns| MutExec(MutationExecutor)
    MutExec ==>|owns| TagWriter(TagWriterService)
    MutExec ==>|owns| DBSync[(LibraryRelationalSyncService)]

    style Bootstrap fill:#f5f5f5,stroke:#d6b656
    style ResMgr fill:#dae8fc,stroke:#6c8ebf
    style TxMgr fill:#fff2cc,stroke:#d6b656
```
