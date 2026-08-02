# Phase 14 — Dependency Injection Standardization & Audit Refinements

## Objective
Standardize dependency injection wiring, clean up constructor signatures, resolve circular dependencies, and apply audit code review refinements.

## Components Created / Refactored
- `src/main/collections/setup.ts`
- `src/main/collections/registry.ts`
- `src/main/collections/resolver.ts`

## Key Architecture Contracts
- **`setupCollectionsEngine(db)`**: Master bootstrap function instantiating repositories, operations, engines, services, and IPC listeners in strict dependency order.
- **`CollectionRegistry`**: Central IoC container holding singleton references to `PlaylistEngine`, `UndoEngine`, `MembershipService`, and `HierarchyService`.

## Features & Technical Behavior
1. **Clean Bootstrapping**: Replaces ad-hoc instantiation with a single, deterministically ordered initialization sequence.
2. **Cycle Elimination**: Resolves circular references between `PlaylistEngine`, `OperationExecutor`, and `UndoEngine`.
3. **Audit Fixes**: Tightens TypeScript types, fixes nullability edge cases, and optimizes memory allocations during startup.
