# Phase 2 — Repository Contracts & Abstraction Layer

## Objective
Define format-agnostic, database-decoupled repository interfaces for collections, entries, and operation journal logging.

## Components Created
- `src/main/collections/repositories/PlaylistRepository.ts` (Interface & Abstract Base)
- `src/main/collections/repositories/OperationJournalRepository.ts` (Interface & Abstract Base)
- `src/main/collections/repositories/CollectionArtworkRepository.ts`

## Key Architecture Contracts
- **`IPlaylistRepository`**: Contract declaring operations for fetching playlists, creating collections, inserting entries, and updating sidebar positions.
- **`IOperationJournalRepository`**: Contract declaring methods for writing journal entries, reading forward/inverse operations by sequence number, and truncating history.
- **`ICollectionArtworkRepository`**: Contract for custom cover image storage and retrieval.

## Features & Technical Behavior
1. **Repository Pattern**: Prevents higher-layer business logic from directly writing raw SQL statements.
2. **Transaction Isolation**: Passes Drizzle transaction handles (`trx`) down interface calls to guarantee multi-table operation atomicity.
3. **Stateless Operations**: Repositories maintain no internal state or caching logic.
