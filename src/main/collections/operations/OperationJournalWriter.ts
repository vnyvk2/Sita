import { operationJournal } from '../../db/schema';
import type { OperationResult } from './types';
import { getNumericKey } from '../../../common/collections/id';
import { eq, and, desc } from 'drizzle-orm';

export class OperationJournalWriter {
  public async write<T>(
    result: OperationResult<T>, 
    trx: DBTransaction
  ): Promise<number> {
    const numericKey = getNumericKey(result.collectionId);
    if (numericKey === undefined) {
      throw new Error(`Cannot write journal for collection with non-numeric key: ${result.collectionId.key}`);
    }

    // Determine the next sequence number for this collection's journal entries
    const [latest] = await trx
      .select({ sequenceNumber: operationJournal.sequenceNumber })
      .from(operationJournal)
      .where(and(
        eq(operationJournal.collectionType, result.collectionId.type),
        eq(operationJournal.collectionId, numericKey)
      ))
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
