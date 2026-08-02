# Phase 9 — Journaled Undo / Redo Engine

## Objective
Build a pointer-based linear history engine (`UndoEngine`) that navigates `OperationJournalRepository` sequence pointers to execute inverse or forward operations without writing new journal records.

## Components Created
- `src/main/collections/engine/UndoEngine.ts`
- `src/main/collections/operations/RestorePlaylistOp.ts`
- `src/main/collections/operations/RestoreSongsOp.ts`

## Key Architecture Contracts
- **`UndoEngine.undo(collectionId)`**: Reads the current sequence number's journal record, resolves the inverse operation via `OperationRegistry`, executes it within a transaction, and decrements sequence pointer (`-1`).
- **`UndoEngine.redo(collectionId)`**: Reads the next sequence number's journal record, resolves the forward operation, executes it, and increments sequence pointer (`+1`).
- **Linear Pointer Invariant**: Performing Undo/Redo does **not** append new journal entries. Making a new forward mutation discards any obsolete redo history branch.

## Features & Technical Behavior
1. **Decoupled Mechanics**: `UndoEngine` contains zero playlist domain rules; it dynamically resolves operation classes from `OperationRegistry`.
2. **Atomic Reverts**: Runs inverse operations, cache invalidation, and sequence pointer updates inside a single database transaction.
3. **Deep State Restoration**: Restores deleted playlists along with exact original IDs, creation dates, artwork associations, and track order positions.
