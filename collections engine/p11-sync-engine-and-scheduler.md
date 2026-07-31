# Phase 11 — Collection Synchronization Engine & Hash Tracking

## Objective
Build background re-evaluation schedulers, dependency graphs, and content hash tracking for smart playlists and synchronized collections.

## Components Created
- `src/main/collections/engine/DependencyAnalyzer.ts`
- `src/main/collections/engine/SmartPlaylistScheduler.ts`
- `src/main/collections/operations/SnapshotSmartPlaylistOp.ts`

## Key Architecture Contracts
- **`DependencyAnalyzer`**: Analyzes smart playlist AST rules to determine library table dependencies (e.g. `songs`, `albums`, `genres`).
- **`SmartPlaylistScheduler`**: Debounces and queues background re-evaluation jobs when underlying library tables are modified.
- **`SnapshotSmartPlaylistOp`**: Converts dynamic smart playlist results into static, snapshot user playlists.

## Features & Technical Behavior
1. **Debounced Re-evaluation**: Batches library update triggers to prevent excessive SQL queries during bulk library scans.
2. **Content Hash Invalidation**: Computes MD5/SHA256 hashes of evaluation results, skipping UI updates if track content has not changed.
3. **Smart-to-Static Snapshots**: Captures current smart evaluation state and persists it as a standard user-editable playlist.
