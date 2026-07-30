# Phase 5 — Playlist Import Planning Engine

## Objective
Implement the **Playlist Import Planning Engine**, responsible for converting a `LibraryResolvedPlaylist` into an immutable `PlaylistImportPlan` describing exact import decisions, statistics, and warning aggregations without performing any database writes or side-effects.

## Architecture
```text
Playlist File
      │
      ▼
M3UImporter
      │
      ▼
ImportedPlaylist
      │
      ▼
PlaylistPathResolver
      │
      ▼
ResolvedPlaylist
      │
      ▼
FilesystemVerifier
      │
      ▼
VerifiedPlaylist
      │
      ▼
LibraryResolver
      │
      ▼
LibraryResolvedPlaylist
      │
      ▼
PlaylistImportPlanner
      │
      ▼
PlaylistImportPlan (Immutable Plan)
```

## Features & Components
1. **`PlaylistImportPlanner`**:
   - Pure, deterministic, side-effect free planner.
   - Evaluates every `LibraryResolvedPlaylistEntry` into an `ImportDecision`:
     - `IMPORT` (Matched library song found).
     - `SKIP_MISSING` (File missing from disk).
     - `SKIP_NOT_IN_LIBRARY` (File exists on disk, but not scanned into Nora library).
     - `SKIP_INVALID` (Non-filesystem or invalid URI).
   - Computes `ImportStatistics`:
     - `totalEntries`, `importedEntries`, `skippedEntries`, `missingEntries`, `notInLibraryEntries`, `invalidEntries`, `warningCount`, `successPercentage`.
   - Aggregates upstream warnings and line-item warnings.

2. **Models**:
   - `ImportDecision`, `ImportStatistics`, `ImportWarning`, `PlaylistImportPlanEntry`, `PlaylistImportPlan`.
   - Complete immutability: Retains full upstream pipeline history (`Imported` -> `Resolved` -> `Verified` -> `LibraryMatched` -> `ImportDecision`).

3. **Side-effect Free**:
   - Zero database mutations, zero `PlaylistEngine` calls, zero IPC or UI side-effects.
