import { getNumericKey } from '../../../common/collections/id';
import type { CollectionId } from '../../../common/collections/types';
import { db } from '../../db/db';
import type { MembershipService } from '../membership/MembershipService';
import type { OperationExecutor } from '../operations/OperationExecutor';
import type { OperationRegistry } from '../operations/OperationRegistry';
import type { OperationInverseInput, OperationContext } from '../operations/types';
import type { OperationJournalRepository } from '../repositories/OperationJournalRepository';

/**
 * UndoEngine handles reverting and reapplying operations for collections.
 *
 * Chosen Undo Model: - Pointer-based history: We navigate a linear history using an in-memory
 * pointer (`sequenceNumber`) rather than a branching tree of inverse operations. - No journal
 * writes during undo/redo: Reverting or reapplying an operation does not append new "undo" or
 * "redo" entries to the journal. Instead, it simply shifts the pointer. - Redo branch discarding:
 * When a new external, forward operation is executed, the redo branch (any operations ahead of the
 * current pointer) becomes unreachable and is logically discarded.
 */
export class UndoEngine {
  private readonly registry: OperationRegistry;
  private readonly journalRepo: OperationJournalRepository;
  private readonly executor: OperationExecutor;
  private readonly membershipService: MembershipService;

  // In-memory UI state
  private readonly sequencePointers = new Map<string | number, number>();

  public getCurrentPointer(collectionId: CollectionId): number | undefined {
    return this.sequencePointers.get(collectionId.key);
  }

  constructor(
    registry: OperationRegistry,
    journalRepo: OperationJournalRepository,
    executor: OperationExecutor,
    membershipService: MembershipService
  ) {
    this.registry = registry;
    this.journalRepo = journalRepo;
    this.executor = executor;
    this.membershipService = membershipService;

    // Attach to the executor so we know when new forward operations are performed
    this.executor.setOnJournalWritten((collectionId, seq) => {
      this.handleNewOperation(collectionId, seq);
    });
  }

  public async undo(collectionId: CollectionId): Promise<boolean> {
    const key = collectionId.key;
    const numericKey = getNumericKey(collectionId);
    if (numericKey === undefined) return false;

    // Determine current sequence pointer. If not initialized, set it to the latest in DB.
    let currentSeq = this.sequencePointers.get(key);
    if (currentSeq === undefined) {
      const latest = await this.journalRepo.getLatest(collectionId.type, numericKey);
      if (!latest) return false; // Nothing to undo
      currentSeq = latest.sequenceNumber;
    }

    if (currentSeq === undefined || currentSeq <= 0) return false; // Reached beginning of history

    const journalEntry = await this.journalRepo.getCurrentOrPrevious(
      collectionId.type,
      numericKey,
      currentSeq
    );
    if (!journalEntry) return false;

    const inverseInput = journalEntry.inverseInput as OperationInverseInput;
    const inverseOp = this.registry.get(inverseInput.operationType);

    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(inverseOp, inverseInput.input, ctx, {
        writeJournal: false
      });
    });

    // Successfully undone. Update pointer.
    this.sequencePointers.set(key, journalEntry.sequenceNumber - 1);

    // Invalidate membership caches
    if (result.affectedSongIds.length > 0) {
      this.membershipService.invalidateSongs(result.affectedSongIds);
    }

    return true;
  }

  public async redo(collectionId: CollectionId): Promise<boolean> {
    const key = collectionId.key;
    const currentSeq = this.sequencePointers.get(key) ?? 0;

    const numericId = getNumericKey(collectionId);
    if (numericId === undefined) return false;
    const nextEntry = await this.journalRepo.getNext(collectionId.type, numericId, currentSeq);
    if (!nextEntry) return false;

    const op = this.registry.get(nextEntry.operationType);

    const result = await db.transaction(async (trx) => {
      const ctx: OperationContext = { trx, membershipService: this.membershipService };
      return await this.executor.execute(op, nextEntry.operationInput, ctx, {
        writeJournal: false
      });
    });

    // Successfully redone. Advance the pointer forwards only after successful execution
    this.sequencePointers.set(key, nextEntry.sequenceNumber);

    if (result.affectedSongIds.length > 0) {
      this.membershipService.invalidateSongs(result.affectedSongIds);
    }

    return true;
  }

  /**
   * Called when a new operation is performed by a forward engine (like PlaylistEngine). This aligns
   * the sequence pointer to the new operation.
   */
  public handleNewOperation(collectionId: CollectionId, newSequenceNumber: number): void {
    const key = collectionId.key;
    this.sequencePointers.set(key, newSequenceNumber);
  }
}
