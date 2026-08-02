# Phase 1 — Domain Entities & Database Schema

## Objective
Establish the foundational domain models, TypeScript types, enums, and Drizzle ORM database schema definitions for the Nora Collections Engine.

## Components Created
- `src/common/collections/types.ts`
- `src/main/collections/context/types.ts`
- `src/main/db/schema.ts` (extended with `playlists`, `collection_entries`, `operation_journal`)

## Key Architecture Contracts
- **`CollectionType`**: Enum defining collection variants (`'USER_PLAYLIST' | 'SMART_PLAYLIST' | 'FOLDER' | 'FAVORITES' | 'HISTORY'`).
- **`CollectionId`**: Strong nominal type for unique collection identification.
- **`CollectionEntry`**: Model representing a track's position within a collection (`id`, `collectionId`, `songId`, `position`, `dateAdded`, `comments`).
- **`OperationJournal`**: Schema storing mutation history (`id`, `collectionId`, `sequenceNumber`, `operationType`, `operationInput`, `inverseInput`, `timestamp`).

## Features & Technical Behavior
1. **Schema Normalization**: Decouples physical track entries from collection metadata, enforcing foreign key relationships and index structures over `(collection_id, position)`.
2. **Type Safety**: Strictly types collection IDs, operation payloads, and execution contexts across main and renderer process boundaries.
3. **Database Migration**: Establishes initial SQLite tables for playlists, smart filter metadata, and transaction journaling.
