# Phase 8 — Queue Engine & Ephemeral Playback Integration

## Objective
Implement `QueueEngine` for fast in-memory playback queue management, separating ephemeral playback states from persistent journaled collection operations.

## Components Created
- `src/main/queue/QueueEngine.ts`
- `src/main/queue/types.ts`

## Key Architecture Contracts
- **`QueueEngine`**: Stateful singleton managing current track index, upcoming queue list, playback history, and shuffle permutation maps.
- **`QueueState`**: In-memory state holding `currentSongId`, `queueSongIds`, `historySongIds`, `isShuffled`, and `repeatMode`.

## Features & Technical Behavior
1. **Architectural Separation**: Deliberately excludes Queue operations from the `OperationJournalWriter` and `UndoEngine`, as queue shuffling and skips are transient playback states, not persistent user collections.
2. **Shuffle Permutation Mapping**: Computes zero-allocation index maps for randomized playback without destroying original playlist sequence order.
3. **IPC State Broadcasting**: Syncs current track and queue progress to UI components via high-frequency event channels.
