# 02. Composition Root Architecture (`MetadataBootstrap`)

All dependency injection and service wiring in the metadata module takes place inside a single composition root: [`MetadataBootstrap`](file:///c:/Users/VINAY/intellije-workspace/Nora/src/main/metadata/setup.ts).

---

## 1. Construction Order View

```mermaid
graph TD
    subgraph Step1 ["1. Networking & Platform Setup"]
        Platform[/PlatformBootstrap/] -.->|creates| ReqPipe[/RequestPipeline/]
        ReqPipe ==> RateLimiter[/RateLimiter: 1 req/sec/]
        ReqPipe ==> RetryPolicy[/RetryPolicy: 3 retries/]
    end

    subgraph Step2 ["2. Provider Adapters Setup"]
        ReqPipe -.-> MBClient[[MusicBrainzApiClient]]
        ReqPipe -.-> DiscogsClient[[DiscogsApiClient]]
        ReqPipe -.-> CAAClient[[CaaApiClient]]

        MBClient -.-> MBAdapter[[MusicBrainzAdapter]]
        DiscogsClient -.-> DiscogsAdapter[[DiscogsAdapter]]
        CAAClient -.-> CAAAdapter[[CoverArtArchiveAdapter]]
    end

    subgraph Step3 ["3. Resolution Registry & Executor Setup"]
        ResReg{ResolutionProviderRegistry}
        MBAdapter --> ResReg
        DiscogsAdapter --> ResReg
        CAAAdapter --> ResReg

        ResReg -.-> ProvExec(MetadataProviderExecutor)
        ProvExec ==> EventBus[/MetadataEventBus/]
    end

    subgraph Step4 ["4. Resolution & Application Layer Setup"]
        ProvExec -.-> LookupGW(DefaultMetadataLookupGateway)
        LookupGW -.-> ResMgr(MetadataResolutionManager)

        ResMgr -.-> AutoTagSvc(AlbumAutoTagService)
    end

    subgraph Step5 ["5. Storage & Transaction Setup"]
        HistorySvc(MetadataHistoryService) -.-> TxMgr(MetadataTransactionManager)
        TagWriter(TagWriterService) -.-> TxMgr
        DBSync[(LibraryRelationalSyncService)] -.-> TxMgr

        TxMgr -.-> JobMgr(MetadataJobManager)
        TxMgr -.-> AutoTagSvc
    end

    subgraph Step6 ["6. MetadataContainer Namespace Assembly"]
        Container[MetadataContainer]
        AutoTagSvc --> Container
        ResMgr --> Container
        TxMgr --> Container
        ReqPipe --> Container
    end

    Step1 --> Step2
    Step2 --> Step3
    Step3 --> Step4
    Step4 --> Step5
    Step5 --> Step6

    style Step1 fill:#f5f5f5,stroke:#d6b656
    style Step3 fill:#d5e8d4,stroke:#82b366
    style Step4 fill:#dae8fc,stroke:#6c8ebf
    style Step5 fill:#fff2cc,stroke:#d6b656
```

---

## 2. Container Namespace Boundaries

`MetadataContainer` groups initialized services into structured domain namespaces:

```ts
return {
  application: {
    userService,
    albumMetadataService,
    autoTagService
  },
  resolution: {
    resolutionManager,
    lookupGateway
  },
  transactions: {
    transactionManager,
    historyService,
    jobManager
  },
  infrastructure: {
    requestPipeline
  }
};
```
