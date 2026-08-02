# Phase 8 — Intelligent Matching & Repair Framework

## Objective
Introduce a pluggable **Intelligent Matching & Repair Framework** (`PlaylistRepairEngine`) that resolves playlist entries that failed exact canonical path matching.

This phase extends the pipeline by processing entries marked as `NOT_IN_LIBRARY` through registered repair strategies without modifying `LibraryResolver` or any existing exact matching logic.

## Architecture
```text
Playlist File
      │
      ▼
M3UImporter
      │
      ▼
PlaylistPathResolver
      │
      ▼
FilesystemVerifier
      │
      ▼
LibraryResolver (Exact Match)
      │
      ▼
PlaylistRepairEngine (Pluggable Strategies)
      │
      ├── ExactFilenameStrategy (Confidence 95)
      └── NormalizedFilenameStrategy (Confidence 85)
      │
      ▼
LibraryResolvedPlaylist (Repaired)
      │
      ▼
PlaylistImportPlanner
      │
      ▼
PlaylistImportExecutor
```

## Features & Components
1. **Models**:
   - `RepairCandidate`: `song`, `confidence` (0..100), `strategyName`, `reason`.
   - `RepairResult`: `repaired`, `candidate?`, `allCandidates?`, `diagnostics?`.

2. **Repair Abstractions & Strategies**:
   - `PlaylistRepairStrategy` interface: `name`, `repair(entry, libraryLookup): Promise<RepairResult | null>`.
   - `RepairStrategyRegistry`: Manages registered repair strategies.
   - `ExactFilenameStrategy`: Matches by exact filename (e.g. `Bohemian Rhapsody.mp3`), confidence 95.
   - `NormalizedFilenameStrategy`: Matches by normalized filename (stripping hyphens, underscores, spaces, case), confidence 85.

3. **`PlaylistRepairEngine`**:
   - Pure, immutable transformation stage.
   - Operates exclusively on unresolved entries (`NOT_IN_LIBRARY`).
   - Leaves `MATCHED` and `MISSING` entries untouched.
   - Produces a new `LibraryResolvedPlaylist` with repaired entries and confidence scores.

4. **Pipeline Integration**:
   - Integrated into `PlaylistImportPipeline` between `LibraryResolver` and `PlaylistImportPlanner`.
