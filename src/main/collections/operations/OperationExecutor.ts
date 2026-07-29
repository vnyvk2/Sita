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

  constructor(journalWriter: OperationJournalWriter) {
    this.journalWriter = journalWriter;
  }

  public async execute<TInput, TResult>(
    operation: CollectionOperation<TInput, TResult>,
    input: TInput,
    ctx: OperationContext
  ): Promise<OperationResult<TResult>> {
    // 1. Execute the operation using the provided context (and its transaction)
    const result = await operation.execute(input, ctx);

    // 2. Write the result to the journal within the SAME transaction
    await this.journalWriter.write(result, ctx.trx);

    // 3. Return the result back to the orchestrating engine
    return result;
  }
}
