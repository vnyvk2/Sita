# Phase 6 — Operation Framework & Inverse Computation

## Objective
Establish the command-pattern mutation framework where every collection operation automatically calculates its exact mathematical inverse for reversible journal logging.

## Components Created
- `src/main/collections/operations/types.ts`
- `src/main/collections/operations/OperationExecutor.ts`
- `src/main/collections/operations/OperationRegistry.ts`
- `src/main/collections/operations/OperationJournalWriter.ts`
- `src/main/collections/operations/AddSongsOp.ts`
- `src/main/collections/operations/RemoveSongsOp.ts`
- `src/main/collections/operations/RenameOp.ts`
- `src/main/collections/operations/ReorderOp.ts`
- `src/main/collections/events/CollectionEventBus.ts`

## Key Architecture Contracts
- **`CollectionOperation<TInput, TResult>`**: Command interface declaring `type`, `execute(input, ctx): Promise<OperationResult<TResult>>`.
- **`OperationResult`**: Return payload containing mutation results, `collectionId`, `inverseType`, `inverseInput`, and optional `statsDelta`.
- **`OperationExecutor`**: Runs operations within an orchestrating layer's transaction, updates folder statistics, and logs the operation to the journal.
- **`OperationRegistry`**: Central lookup map resolving operation type strings to executable class instances.

## Features & Technical Behavior
1. **Symmetric Inverses**:
   - `AddSongsOp` computes an inverse `RemoveSongsOp` payload containing inserted entry IDs.
   - `RemoveSongsOp` captures deleted entry snapshots (songs, positions, dates) to compute an inverse `RestoreSongsOp` payload.
   - `RenameOp` captures previous name string to compute an inverse `RenameOp` payload.
2. **Transaction Scoping**: Executes operation database mutations and journal writes inside the same transaction.
3. **Event Dispatching**: Emits structured events over `CollectionEventBus` upon successful execution.
