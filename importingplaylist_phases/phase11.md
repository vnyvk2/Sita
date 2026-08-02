# Phase 11 — Conflict Detection & Resolution Framework

## Objective
Introduce an explicit **Conflict Detection & Resolution Framework** between synchronization planning and execution in `src/main/playlistSync/`.

This framework allows Nora to identify ambiguous changes (duplicate entries, local modifications, missing songs) and resolve them deterministically using resolution strategies without dirtying `PlaylistSyncPlanner` or `PlaylistSyncExecutor`.

## Architecture
```text
Source Playlist
        │
        ▼
PlaylistSyncPlanner (Objective Plan Generation)
        │
        ▼
PlaylistSyncPlan (Raw Sync Operations)
        │
        ▼
PlaylistConflictAnalyzer (Inspects Plan & Current Playlist → ConflictAnalysis)
        │
        ▼
ConflictResolutionPlanner (Applies ConflictResolutionStrategy → ResolvedSyncPlan)
        │
        ▼
PlaylistSyncExecutor (Atomic Execution)
```

## Features & Components
1. **Domain Models**:
   - `PlaylistConflict`: `id`, `type` (`LOCAL_MODIFIED` | `SOURCE_MODIFIED` | `BOTH_MODIFIED` | `DUPLICATE_ENTRY` | `MISSING_SONG` | `LOW_CONFIDENCE_MATCH` | `REORDER_CONFLICT`), `severity`, `songId`, `reason`, `suggestedResolution`, `requiresUserDecision`.
   - `ConflictAnalysis`: `conflicts`, `hasConflicts`, `hasManualConflicts`.
   - `ConflictSummary`: `totalConflicts`, `resolvedAutomatically`, `manualConflicts`, `ignoredConflicts`.

2. **Analyzer & Strategies**:
   - `PlaylistConflictAnalyzer`: Inspects plan operations for duplicates and ambiguities.
   - `ConflictResolutionStrategy` interface: Evaluates and transforms operations for specific conflicts.
   - `SourceWinsConflictStrategy` & `KeepLocalConflictStrategy`: Built-in resolution strategies.
   - `ConflictResolutionPlanner`: Produces a finalized `ResolvedSyncPlan`.

3. **Workflow Integration**:
   - `PlaylistSyncWorkflow` incorporates analysis and resolution steps.
   - Exposes conflicts in IPC preview calls.
