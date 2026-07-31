# Phase 3 — Drizzle Repository Implementation

## Objective
Implement concrete SQLite data access repositories using Drizzle ORM to perform efficient, type-safe queries and multi-join operations.

## Components Created
- `src/main/collections/repositories/PlaylistRepository.ts`
- `src/main/collections/repositories/OperationJournalRepository.ts`
- `src/main/collections/repositories/CollectionArtworkRepository.ts`

## Key Architecture Contracts
- **`PlaylistRepository.getPlaylistWithEntries(id, trx)`**: Executes joined SQL queries fetching collection metadata along with ordered track references.
- **`OperationJournalRepository.write(result, trx)`**: Writes forward and inverse operation payloads as JSON blobs inside current transaction bounds.
- **`PlaylistRepository.applyStatisticsDelta(id, delta, trx)`**: Performs in-place SQL atomic updates for `itemCount` and `totalDuration`.

## Features & Technical Behavior
1. **Optimized SQL Joins**: Combines playlist metadata and track join tables into single parameterized SQL statements.
2. **Atomic Journal Writing**: Guarantees that every mutation's inverse payload is persisted to `operation_journal` in the exact same transaction as the data modification.
3. **Prepared Statements & Query Optimization**: Uses Drizzle query builders to avoid SQL injection vulnerabilities and maximize SQLite read performance.
