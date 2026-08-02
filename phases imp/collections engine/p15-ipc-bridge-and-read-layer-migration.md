# Phase 15 — IPC Bridge Layer & Read Layer Migration

## Objective
Establish type-safe Electron IPC communication bridges, reactive query options, and DTO transformers to connect the backend Collections Engine to the React UI.

## Components Created
- `src/main/collections/ipc/setupCollectionIpc.ts`
- `src/main/collections/ipc/dtos.ts`
- `src/main/collections/providers/PlaylistProvider.ts`
- `src/main/collections/diagnostics/CollectionDiagnostics.ts`

## Key Architecture Contracts
- **`setupCollectionIpc(engine, undoEngine, provider)`**: Registers IPC handlers for `collections:read:*` and `collections:write:*` channels.
- **`PlaylistProvider`**: Exposes read query methods and subscribes to `CollectionEventBus` to push real-time invalidation signals over IPC.
- **DTO Mappers**: Sanitizes database entities into serializable client DTOs.

## Features & Technical Behavior
1. **Type-Safe IPC Contracts**: Guarantees compile-time type safety between React Query options in renderer process and main process IPC handlers.
2. **Reactive Cache Invalidation**: Fires IPC events when collections mutate, triggering React Query cache invalidation in the UI.
3. **Diagnostics & Logging**: Captures IPC call metrics, execution timings, and error tracebacks.
