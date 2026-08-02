# Phase 4 — Data Layer Invariants & Integrity Validation

## Objective
Enforce strict database invariants, foreign key cascade behaviors, track position re-indexing algorithms, and duplicate prevention rules.

## Components Created / Updated
- `src/main/collections/repositories/PlaylistRepository.ts`
- `src/main/collections/context/types.ts`

## Key Architecture Contracts
- **`normalizePositions(collectionId, trx)`**: Re-indexes track positions sequentially (`1..N`) to repair gap anomalies caused by batch track deletions.
- **`validateCollectionExists(id, trx)`**: Checks that target collection IDs are valid before executing mutations.
- **`CollectionInvariantError`**: Custom error class thrown when position conflicts or invalid collection types are encountered.

## Features & Technical Behavior
1. **Positional Gap Repair**: Automatically compacts track positions when items are removed or moved, ensuring continuous 1-based ordering.
2. **Cascade Deletion Integrity**: Cleans up collection entries, smart playlist metadata, and journal references when a playlist or folder is deleted.
3. **Data Constraint Validation**: Prevents invalid parent folder assignments (e.g. self-referencing folders) at the data repository boundary.
