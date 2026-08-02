# Phase 13 — Interactive Review & Decision Framework

## Objective
Introduce an **Interactive Review & Decision Subsystem** (`src/main/playlistReview/`) allowing users to inspect import plans, review repair candidates and conflicts, submit validated user overrides, and regenerate final execution plans.

This phase does not modify any core import (Phases 1–9), sync (Phases 10–11), or automation (Phase 12) backend code.

## Architecture
```text
Pipeline Generated Plan / Preview
        │
        ▼
PlaylistReviewService (Session Creation & State Management)
        │
        ▼
ReviewSession (Temporary Session Model: Original Plan + Current Plan + Overrides)
        │
        ├── User Submits UserOverride (SELECT_CANDIDATE, FORCE_SKIP, FORCE_IMPORT)
        ├── ReviewValidator Validates Overrides against Rules
        └── Regenerates Updated PlaylistImportPlan with Applied Overrides
        │
        ▼
PlaylistImportExecutor (Executes Validated Plan)
```

## Features & Components
1. **Domain Models**:
   - `UserOverride`: `id`, `entryPosition`, `type` (`SELECT_CANDIDATE` | `FORCE_SKIP` | `FORCE_IMPORT` | `RESOLVE_CONFLICT`), `selectedSongId`, `conflictResolutionChoice`, `reason`.
   - `ReviewSession`: `id`, `originalPlan`, `currentPlan`, `userOverrides`, `isValid`, `validationErrors`.

2. **Validator & Service**:
   - `ReviewValidator`: Validates override target positions and song ID existence.
   - `PlaylistReviewService`: Manages temporary review sessions, applies overrides, validates plans, and regenerates updated `PlaylistImportPlan` instances.

3. **IPC Setup**:
   - Registers `playlistReview:create`, `playlistReview:override`, `playlistReview:validate`, and `playlistReview:execute` IPC endpoints.
