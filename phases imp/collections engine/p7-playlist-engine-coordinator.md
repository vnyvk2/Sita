# Phase 7 — Playlist Engine Coordinator

## Objective
Implement `PlaylistEngine`, the central stateful orchestrator for playlist mutations, transaction control, lock acquisition, and reactive event notifications.

## Components Created
- `src/main/collections/engine/PlaylistEngine.ts`
- `src/main/collections/operations/CreatePlaylistOp.ts`
- `src/main/collections/operations/DeleteOp.ts`

## Key Architecture Contracts
- **`PlaylistEngine.createPlaylist(name, description, parentId)`**: Opens a database transaction, executes `CreatePlaylistOp`, logs journal entry, invalidates cache, and notifies listeners.
- **`PlaylistEngine.addSongsToPlaylist(playlistId, songIds)`**: Executes song insertion while holding an async mutex lock on `playlistId`.
- **`PlaylistEngine.deletePlaylist(playlistId)`**: Captures full playlist state, entries, and metadata for inverse `RestorePlaylistOp` before performing cascade delete.

## Features & Technical Behavior
1. **Async Mutex Concurrency Control**: Serializes concurrent mutation requests targeted at the same collection ID to eliminate race conditions.
2. **Transaction Boundaries**: Manages database transactions, ensuring rollback if operation execution, journal writing, or statistics update fails.
3. **Cache & Event Synchronization**: Automatically triggers `MembershipCache` invalidation and `CollectionEventBus` event emission after transaction commit.
