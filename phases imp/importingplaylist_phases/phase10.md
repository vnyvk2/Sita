# Phase 10 — Playlist Synchronization Framework

## Objective
Implement a dedicated **Playlist Synchronization Subsystem** (`src/main/playlistSync/`) responsible for reconciling linked external playlist files with existing Nora playlists over time.

This phase does not modify any code in `src/main/playlistImport/` (Phases 1–9 import pipeline remains stable & untouched).

## Architecture
```text
Linked Source File (Disk / Cloud)
        │
        ▼
PlaylistSourceTracker (Hash & MTime Change Detection)
        │
        ▼
PlaylistSyncPlanner (Reconciliation Planner)
        │
        ├── Compares Target File Plan against Current Nora Playlist
        └── Generates Sync Operations (ADD_SONG, REMOVE_SONG) based on SyncPolicy
        │
        ▼
PlaylistSyncPlan (Preview / Operations / Counts)
        │
        ▼
PlaylistSyncExecutor (Atomic Execution via TransactionRunner & PlaylistEngine)
        │
        ▼
PlaylistSyncWorkflow (Orchestrator & History Session Recording)
```

## Features & Components
1. **Domain Models**:
   - `PlaylistLink`: `id`, `playlistId`, `sourceFile`, `format`, `lastImportedAt`, `lastSyncedAt?`, `fileHash?`, `syncPolicy`.
   - `SyncPolicy`: `'ONE_WAY_SOURCE_WINS' | 'KEEP_LOCAL_CHANGES' | 'MANUAL'`.
   - `SyncOperation`: `type` (`ADD_SONG` | `REMOVE_SONG` | `REORDER`), `songId`, `position`, `reason`.
   - `PlaylistSyncPlan`: `linkId`, `playlistId`, `sourceFile`, `syncPolicy`, `operations`, `hasChanges`, `additionsCount`, `removalsCount`.

2. **Services & Pipeline**:
   - `PlaylistSourceTracker`: Computes source hashes and checks modification status.
   - `PlaylistSyncPlanner`: Pure reconciliation planner comparing target playlist entries vs current Nora playlist entries.
   - `PlaylistSyncExecutor`: Atomically applies `ADD_SONG` and `REMOVE_SONG` operations using `PlaylistPersistence` and `TransactionRunner`.
   - `PlaylistSyncWorkflow`: Orchestrates detection, plan generation, and sync execution.

3. **IPC**:
   - Registers `playlistSync:preview`, `playlistSync:execute`, and `playlistSync:checkLinks` IPC endpoints.
