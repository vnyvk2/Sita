# Phase 9 — Import Sessions, History & Undo

## Objective
Introduce **Import Sessions, History, Undo, and Replay capabilities** around the completed import pipeline without altering any parser, resolver, verifier, planner, or executor logic.

Every playlist import becomes a tracked, audited, and recoverable session.

## Architecture
```text
User / UI / IPC
        │
        ▼
PlaylistImportWorkflow (Session Lifecycle Tracking)
        │
        ├── 1. Pipeline Execution (PlaylistImportPipeline)
        ├── 2. Executor Execution (PlaylistImportExecutor)
        └── 3. Session Persistence (PlaylistImportHistoryRepository)
        │
        ▼
PlaylistImportSession (Auditable Metadata)
        │
        ├── PlaylistImportHistoryService
        │       ├── listHistory()
        │       ├── undoImport()   ──► Deletes created playlist from PlaylistPersistence
        │       └── replayImport() ──► Reruns Workflow pipeline for sourceFile
```

## Features & Components
1. **Models**:
   - `RepairSummary`: `repairedCount`, `exactMatches`, `repairedMatches`, `highestConfidence`, `lowestConfidence`, `strategiesUsed`.
   - `PlaylistImportSession`: `id`, `sourceFile`, `playlistName`, `startedAt`, `completedAt`, `status` (`PENDING` | `IN_PROGRESS` | `COMPLETED` | `FAILED` | `UNDONE`), `statistics`, `execution`, `warnings`, `repairSummary`.

2. **History Abstraction & Repository**:
   - `PlaylistImportHistoryRepository`: `saveSession`, `getSession`, `listSessions`, `deleteSession`, `updateSession`.
   - `InMemoryPlaylistImportHistoryRepository`: Concrete storage implementation.

3. **`PlaylistImportHistoryService`**:
   - Audit trail management for completed import sessions.
   - `undoImport(sessionId)`: Safely deletes the imported playlist via `PlaylistPersistence` and marks session as `UNDONE`.
   - `replayImport(sessionId)`: Reruns `PlaylistImportWorkflow` for the session's `sourceFile`.

4. **IPC Extensions**:
   - Exposes `playlistImport:history`, `playlistImport:undo`, and `playlistImport:replay` IPC endpoints.
