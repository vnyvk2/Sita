# Phase 13 — Folder Statistics, Pinning, Duplication & Bulk Mutations

## Objective
Implement folder aggregate statistics propagation, playlist pinning, duplicate planning/execution, and bulk playlist operations.

## Components Created
- `src/main/collections/engine/FolderStatisticsService.ts`
- `src/main/collections/operations/DuplicatePlanner.ts`
- `src/main/collections/operations/DuplicateExecutor.ts`
- `src/main/collections/operations/DuplicateOp.ts`
- `src/main/collections/operations/PinOp.ts`
- `src/main/collections/operations/BulkDeleteOp.ts`
- `src/main/collections/operations/MergePlaylistsOp.ts`

## Key Architecture Contracts
- **`FolderStatisticsService.propagateStats(targetPlaylistId, itemCountDelta, durationDelta, trx)`**: Recursively updates total track count and duration across all ancestor folders in the tree.
- **`DuplicatePlanner` & `DuplicateExecutor`**: Deep-copies playlists and folder structures, renaming duplicates (`"My Playlist (1)"`) while preserving nested hierarchy relationships.
- **`PinOp`**: Toggles collection pinned status for quick sidebar access.
- **`MergePlaylistsOp`**: Combines multiple playlists into a target playlist while stripping duplicates.

## Features & Technical Behavior
1. **Recursive Stats Delta Propagation**: Updates ancestor folder aggregates in $O(\text{depth})$ time inside current transaction.
2. **Atomic Duplication**: Clones complex folder trees along with internal references within a single transaction.
3. **Journaled Bulk Mutations**: All bulk operations compute comprehensive inverse payloads for instant undoability.
