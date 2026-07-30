import type { CollectionId } from '../../../common/collections/types';
import type { CollectionOperation, OperationContext, OperationResult } from './types';
import type { OperationJournalWriter } from './OperationJournalWriter';

/**
 * Executes a CollectionOperation and automatically delegates the result
 * to the OperationJournalWriter.
 * 
 * Important: The OperationExecutor does NOT own the transaction boundary.
 * The transaction is opened by the orchestrating layer (e.g., Playlist Engine)
 * and passed into the executor via the OperationContext.
 */
export class OperationExecutor {
  private readonly journalWriter: OperationJournalWriter;
  private onJournalWrittenListener?: (collectionId: CollectionId, sequenceNumber: number) => void;

  constructor(journalWriter: OperationJournalWriter) {
    this.journalWriter = journalWriter;
  }

  public setOnJournalWritten(listener: (collectionId: CollectionId, sequenceNumber: number) => void) {
    this.onJournalWrittenListener = listener;
  }

  public async execute<TInput, TResult>(
    operation: CollectionOperation<TInput, TResult>,
    input: TInput,
    ctx: OperationContext,
    options?: { writeJournal?: boolean }
  ): Promise<OperationResult<TResult>> {
    // 1. Execute the operation using the provided context (and its transaction)
    const result = await operation.execute(input, ctx);

    // 2. Write the result to the journal within the SAME transaction (if requested)
    if (options?.writeJournal !== false) {
      const seq = await this.journalWriter.write(result, ctx.trx);
      if (this.onJournalWrittenListener) {
        this.onJournalWrittenListener(result.collectionId, seq);
      }
    }

    // 3. Return the result back to the orchestrating engine
    return result;
  }
}
