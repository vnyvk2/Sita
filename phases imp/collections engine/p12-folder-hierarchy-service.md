# Phase 12 — Folder Hierarchy Engine & Tree Operations

## Objective
Implement `HierarchyService` and DAG traversal operations for nested playlist folders, parent/child relationships, cycle detection, and sidebar ordering.

## Components Created
- `src/main/collections/engine/HierarchyService.ts`
- `src/main/collections/operations/CreateFolderOp.ts`
- `src/main/collections/operations/MoveCollectionOp.ts`
- `src/main/collections/operations/UpdateSidebarPositionsOp.ts`

## Key Architecture Contracts
- **`HierarchyService.getDescendants(playlistId)`**: Fetches all direct and indirect children of a folder node.
- **`HierarchyService.getAncestors(playlistId)`**: Fetches parent node chain up to root folder.
- **`HierarchyService.validateMove(sourceId, targetParentId)`**: Prevents circular folder moves (e.g. moving a folder into its own descendant).
- **`HierarchyService.topologicalOrder(nodes)`**: Returns nodes in topological order (parents before children) with case-insensitive sibling name sorting.

## Features & Technical Behavior
1. **Cycle Prevention**: Ensures moving folders never creates infinite parent loops.
2. **Topological Tree Sorting**: Sorts tree structures deterministically for UI sidebar rendering.
3. **Journaled Relocations**: `MoveCollectionOp` logs previous `parentId` to enable full Undo/Redo of folder moves.
