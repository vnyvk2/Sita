# Phase 12 — Event-Driven Automation & Background Synchronization

## Objective
Introduce an **Event-Driven Automation Subsystem** (`src/main/playlistAutomation/`) that listens to filesystem and library events via an internal EventBus, evaluates automation rules, debounces rapid file modifications, and executes synchronization workflows autonomously.

This phase does not modify any core import (Phases 1–9) or sync (Phases 10–11) logic.

## Architecture
```text
Event Producers (Watcher / System / User)
        │
        ▼
PlaylistEventBus (Internal Pub/Sub Event Router)
        │
        ▼
PlaylistAutomationEngine (Rule Evaluation & Event Bus Listener)
        │
        ▼
AutomationScheduler (Debounces, Coalesces & Delays Execution)
        │
        ▼
PlaylistSyncWorkflow (Existing Reused Workflow Orchestrator)
        │
        ▼
Sync Execution & History Sessions
```

## Features & Components
1. **Event Models & Bus**:
   - `PlaylistAutomationEvent`: `id`, `type` (`SOURCE_FILE_CHANGED` | `PLAYLIST_CREATED` | `PLAYLIST_DELETED` | `SYNC_COMPLETED` | `LIBRARY_UPDATED` | `USER_REQUESTED_SYNC`), `timestamp`, `sourceFile`, `playlistId`.
   - `PlaylistEventBus`: Internal pub/sub event router (`publish`, `subscribe`).

2. **Automation Rules & Scheduler**:
   - `AutomationRule`: `id`, `name`, `enabled`, `eventTypes`, `debounceMs`.
   - `AutomationScheduler`: Coalesces rapid sequential events for the same file/playlist into a single scheduled sync action.

3. **Automation Engine & IPC**:
   - `PlaylistAutomationEngine`: Evaluates rules and triggers `PlaylistSyncWorkflow` preview and execution.
   - `setupPlaylistAutomationIpc`: Exposes `playlistAutomation:enable`, `playlistAutomation:disable`, `playlistAutomation:status`, and `playlistAutomation:rules`.
