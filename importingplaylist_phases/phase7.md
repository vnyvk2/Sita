# Phase 7 — Playlist Import Workflow & Preview

## Objective
Build the complete **user import workflow and preview orchestration layer** on top of the finished backend pipeline.

This phase connects the importer pipeline to Nora's IPC interface and user workflows without modifying any lower-level parser, resolver, verifier, planner, or executor components.

## Architecture
```text
User Selects Playlist File (UI / IPC)
        │
        ▼
PlaylistImportWorkflow (Orchestrator)
        │
        ├── 1. Reading & Parsing (PlaylistImportService)
        ├── 2. Path Resolution (PlaylistPathResolver)
        ├── 3. Filesystem Verification (FilesystemVerifier)
        ├── 4. Library Matching (LibraryResolver)
        └── 5. Import Planning (PlaylistImportPlanner)
        │
        ▼
PlaylistImportPlan (Preview / Statistics / Warnings)
        │
        ▼
User Confirmation (IPC `playlistImport.execute`)
        │
        ▼
PlaylistImportExecutor
        │
        ▼
PlaylistImportExecutionResult
```

## Features & Components
1. **Progress Models**:
   - `PlaylistImportStage`: `'IDLE' | 'READING_FILE' | 'PARSING_PLAYLIST' | 'RESOLVING_PATHS' | 'VERIFYING_FILES' | 'MATCHING_LIBRARY' | 'PLANNING_IMPORT' | 'EXECUTING_IMPORT' | 'COMPLETED' | 'FAILED'`.
   - `PlaylistImportProgress`: `stage`, `message`, `percentage`.

2. **`PlaylistImportWorkflow`**:
   - Orchestrates `PlaylistImportService`, `PlaylistPathResolver`, `FilesystemVerifier`, `LibraryResolver`, `PlaylistImportPlanner`, and `PlaylistImportExecutor`.
   - Emits progress updates through a callback listener (`onProgress`).
   - Exposes `createPlanFromFile(filePath)` (for preview) and `executePlan(plan)` (for execution).

3. **IPC Registration**:
   - `setupPlaylistImportIpc()` registering `playlistImport:preview` and `playlistImport:execute` IPC handlers.

4. **Zero Backend Changes**:
   - The lower-level pipeline remains untouched and decoupled.
