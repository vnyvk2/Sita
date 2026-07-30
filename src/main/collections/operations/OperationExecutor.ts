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
import { PlaylistRepository } from '../repositories/PlaylistRepository';
import { FolderStatisticsService } from '../engine/FolderStatisticsService';

export class OperationExecutor {
  private readonly journalWriter: OperationJournalWriter;
  private readonly repository: PlaylistRepository;
  private readonly folderStats: FolderStatisticsService;
  private onJournalWrittenListener?: (collectionId: CollectionId, sequenceNumber: number) => void;

  constructor(
    journalWriter: OperationJournalWriter,
    repository: PlaylistRepository = new PlaylistRepository(),
    folderStats: FolderStatisticsService = new FolderStatisticsService()
  ) {
    this.journalWriter = journalWriter;
    this.repository = repository;
    this.folderStats = folderStats;
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

    // 2. Automatically apply statistics delta and propagate to ancestor folders inside transaction
    if (result.statsDelta) {
      const { targetPlaylistId, itemCountDelta, durationDelta } = result.statsDelta;
      if (itemCountDelta !== 0 || durationDelta !== 0) {
        await this.repository.applyStatisticsDelta(
          targetPlaylistId,
          { itemCountDelta, durationDelta },
          ctx.trx
        );
        await this.folderStats.propagateStats(
          targetPlaylistId,
          itemCountDelta,
          durationDelta,
          ctx.trx
        );
      }
    }

    // 3. Write the result to the journal within the SAME transaction (if requested)
    if (options?.writeJournal !== false) {
      const seq = await this.journalWriter.write(result, ctx.trx);
      if (this.onJournalWrittenListener) {
        this.onJournalWrittenListener(result.collectionId, seq);
      }
    }

    // 4. Return the result back to the orchestrating engine
    return result;
  }
}
