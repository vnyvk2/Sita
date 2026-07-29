import { db } from '../../db/db';
import { operationJournal } from '../../db/schema';
import { eq, and, desc, asc, lte, gt } from 'drizzle-orm';
import type { DB, DBTransaction } from '../../db/db';

export class OperationJournalRepository {
  public async getCurrentOrPrevious(
    collectionType: string,
    collectionId: number,
    maxSequenceNumber: number,
    trx: DB | DBTransaction = db
  ) {
    const [entry] = await trx
      .select()
      .from(operationJournal)
      .where(
        and(
          eq(operationJournal.collectionType, collectionType),
          eq(operationJournal.collectionId, collectionId),
          lte(operationJournal.sequenceNumber, maxSequenceNumber)
        )
      )
      .orderBy(desc(operationJournal.sequenceNumber))
      .limit(1);
    return entry || null;
  }

  public async getLatest(
    collectionType: string,
    collectionId: number,
    trx: DB | DBTransaction = db
  ) {
    const [latest] = await trx
      .select()
      .from(operationJournal)
      .where(
        and(
          eq(operationJournal.collectionType, collectionType),
          eq(operationJournal.collectionId, collectionId)
        )
      )
      .orderBy(desc(operationJournal.sequenceNumber))
      .limit(1);
    return latest || null;
  }

  public async getNext(
    collectionType: string,
    collectionId: number,
    afterSequenceNumber: number,
    trx: DB | DBTransaction = db
  ) {
    const [next] = await trx
      .select()
      .from(operationJournal)
      .where(
        and(
          eq(operationJournal.collectionType, collectionType),
          eq(operationJournal.collectionId, collectionId),
          gt(operationJournal.sequenceNumber, afterSequenceNumber)
        )
      )
      .orderBy(asc(operationJournal.sequenceNumber))
      .limit(1);
    return next || null;
  }
}
