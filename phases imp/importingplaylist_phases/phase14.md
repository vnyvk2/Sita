# Phase 14 — Batch Operations & Multi-Playlist Orchestration

## Objective
Introduce a dedicated **Batch Operations Subsystem** (`src/main/playlistBatch/`) to coordinate execution across dozens or hundreds of playlists concurrently and sequentially without altering any single-playlist workflow logic.

This phase does not modify any Phase 1–13 import, sync, conflict, review, or automation code.

## Architecture
```text
Batch Request (Folder of M3Us / Multi-Sync)
        │
        ▼
PlaylistBatchPlanner & PlaylistDependencyGraph (Topological Sorting)
        │
        ▼
BatchExecutionPlan (BatchItem[] + Execution Order + BatchExecutionPolicy)
        │
        ▼
PlaylistBatchOrchestrator (Concurrency & Failure Policy Control)
        │
        ├── Invokes PlaylistImportWorkflow / PlaylistSyncWorkflow per playlist
        ├── Manages Concurrency, Retries, and Execution Policies (CONTINUE_ON_ERROR / STOP_ON_ERROR)
        └── Supports pause(), resume(), and cancel()
        │
        ▼
BatchExecutionSummary (Aggregated Counts & Operations Report)
```

## Features & Components
1. **Domain Models**:
   - `BatchItem`: `id`, `action` (`IMPORT` | `SYNC`), `sourceFile`, `playlistId`, `status`, `dependencies`.
   - `BatchExecutionPolicy`: `'CONTINUE_ON_ERROR' | 'STOP_ON_ERROR' | 'PAUSE_ON_MANUAL_REVIEW'`.
   - `BatchExecutionPlan`: `id`, `items`, `executionOrder`, `policy`.
   - `BatchExecutionSummary`: `batchId`, `totalPlaylists`, `successfulCount`, `failedCount`, `skippedCount`, `pausedCount`, `importedSongsCount`, `durationMs`.
   - `BatchSession`: `id`, `plan`, `status` (`IDLE` | `RUNNING` | `PAUSED` | `COMPLETED` | `CANCELLED` | `FAILED`), `startedAt`, `completedAt`, `summary`.

2. **Graph & Planner**:
   - `PlaylistDependencyGraph`: Performs topological sorting to order dependent playlist items.
   - `PlaylistBatchPlanner`: Builds `BatchExecutionPlan` instances.

3. **Orchestrator & IPC**:
   - `PlaylistBatchOrchestrator`: Orchestrates multi-playlist execution with configurable concurrency, pause, resume, and cancellation support.
   - `setupPlaylistBatchIpc`: Registers `playlistBatch:create`, `playlistBatch:execute`, `playlistBatch:pause`, `playlistBatch:resume`, `playlistBatch:cancel`, and `playlistBatch:status`.
