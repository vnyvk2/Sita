# 03. Subsystem Responsibility Matrix

This matrix defines the authoritative owner, permitted collaborators, and forbidden calls for every major responsibility in the Metadata Platform.

---

## Responsibility Matrix Table

| Core Responsibility | Authoritative Owner | May Use | Must Not Use |
|---|---|---|---|
| **Multi-Provider Candidate Search** | `MetadataResolutionManager` | `DefaultMetadataLookupGateway`, `MetadataProviderExecutor` | `TagWriterService`, `SQLite DB` |
| **Field Contribution Merging** | `MetadataMergeEngine` | `FieldContribution`, `ProviderRegistry` | Direct HTTP APIs, Disk File I/O |
| **Resilient Query Execution** | `MetadataProviderExecutor` | `CircuitBreaker`, `RateLimiter`, `RetryPolicy` | SQLite DB, Transaction Managers |
| **Transaction Coordination** | `MetadataTransactionManager` | `MutationExecutor`, `ArtworkDownloaderService` | Resolution Managers, Search Gateways |
| **Physical File Tag Writing** | `TagWriterService` | `node-id3`, File System | Database Sync, Web APIs |
| **Database Relational Sync** | `LibraryRelationalSyncService` | SQLite / Drizzle ORM | File Tag Writers, Remote Network |
| **Preview Presentation Diffing** | `MetadataDiffBuilder` | `TrackMatchPair`, `AlbumSuffixPreserver` | `MetadataTransactionManager`, Disk I/O |
| **Composition & Wiring** | `MetadataBootstrap` | Platform Factories, Infrastructure Builders | Runtime business logic execution |

---

## Subsystem Responsibility Rules

1. **Responsibility over Class Names**: Component responsibilities remain invariant even if class signatures evolve.
2. **Strict Separation of Concerns**: Querying/resolution code is strictly segregated from mutation/transaction code.
