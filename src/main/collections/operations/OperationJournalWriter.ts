import { eq, and, desc, gt } from 'drizzle-orm';

import { getNumericKey } from '../../../common/collections/id';
import type { CollectionId } from '../../../common/collections/types';
import type { DBTransaction } from '../../db/db';
import { operationJournal } from '../../db/schema';
import type { OperationResult } from './types';

export class OperationJournalWriter {
  private pointerProvider?: (collectionId: CollectionId) => number | undefined;

  public setPointerProvider(provider: (collectionId: CollectionId) => number | undefined) {
    this.pointerProvider = provider;
  }

  public async write<T>(result: OperationResult<T>, trx: DBTransaction): Promise<number> {
    const numericKey = getNumericKey(result.collectionId);
    if (numericKey === undefined) {
      throw new Error(
        `Cannot write journal for collection with non-numeric key: ${result.collectionId.key}`
      );
    }

    // Proactively prune the redo branch if we have an in-memory pointer
    const currentSeq = this.pointerProvider ? this.pointerProvider(result.collectionId) : undefined;

    if (currentSeq !== undefined) {
      // Delete any journal entries ahead of the current pointer
      await trx
        .delete(operationJournal)
        .where(
          and(
            eq(operationJournal.collectionType, result.collectionId.type),
            eq(operationJournal.collectionId, numericKey),
            gt(operationJournal.sequenceNumber, currentSeq)
          )
        );
    }

    // Determine the next sequence number for this collection's journal entries
    const [latest] = await trx
      .select({ sequenceNumber: operationJournal.sequenceNumber })
      .from(operationJournal)
      .where(
        and(
          eq(operationJournal.collectionType, result.collectionId.type),
          eq(operationJournal.collectionId, numericKey)
        )
      )
      .orderBy(desc(operationJournal.sequenceNumber))
      .limit(1);

    const nextSequenceNumber = (latest?.sequenceNumber ?? 0) + 1;

    // Insert the operation record
    await trx.insert(operationJournal).values({
      collectionType: result.collectionId.type,
      collectionId: numericKey,
      operationType: result.operationType,
      direction: 'forward',
      operationInput: result.operationInput,
      inverseInput: result.inverseInput,
      sequenceNumber: nextSequenceNumber
    });

    return nextSequenceNumber;
  }
}
