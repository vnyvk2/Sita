# Phase 6 — Playlist Import Execution Engine

## Objective
Implement the **Playlist Import Execution Engine**, responsible for consuming a `PlaylistImportPlan` and persisting the playlist to Nora using the existing `PlaylistEngine` and database transaction infrastructure.

## Architecture
```text
PlaylistImportPlan
        │
        ▼
PlaylistImportExecutor
        │
        ▼
PlaylistPersistence (Abstract Adapter Interface)
        │
        ▼
EnginePlaylistPersistence (Delegates to PlaylistEngine & Drizzle TRX)
        │
        ▼
Database Transaction (Atomic Commit/Rollback)
        │
        ▼
PlaylistImportExecutionResult
```

## Features & Components
1. **`PlaylistPersistence` Interface**:
   - `createPlaylist(name: string, description?: string): Promise<number>`
   - `addEntries(playlistId: number, songIds: number[]): Promise<void>`
   - `runInTransaction<T>(work: () => Promise<T>): Promise<T>`
   - `EnginePlaylistPersistence`: Concrete implementation delegating to `PlaylistEngine`.

2. **`PlaylistImportExecutor`**:
   - Consumes `PlaylistImportPlan`.
   - Trusts the plan completely (performs **no** matching, validation, or path checking).
   - Filters entries where `decision === 'IMPORT'` and extracts `matchedSongId` preserving order.
   - Executes playlist creation and entry addition inside an atomic database transaction.
   - Generates `PlaylistImportExecutionResult` with statistics (`durationMs`, `importedEntriesCount`, `skippedEntriesCount`) and song IDs for undo capability.

3. **Side-effect Boundary**:
   - Side-effects are strictly isolated to `PlaylistImportExecutor`.
   - Atomic rollback if any persistence error occurs.
