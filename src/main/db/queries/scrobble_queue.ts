import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

import logger from '../../logger';
import { db } from '../db';
import { scrobbleQueue } from '../schema';

const MAX_QUEUE_SIZE = 1000;
const MAX_RETRY_COUNT = 3;
const TTL_DAYS = 30;

export async function getPendingCount(trx: DB | DBTransaction = db): Promise<number> {
  // Count both pending and in-flight (sending) rows so the capacity check
  // reflects the real effective queue size.
  const result = await trx
    .select({ count: sql<number>`count(*)` })
    .from(scrobbleQueue)
    .where(inArray(scrobbleQueue.status, ['pending', 'sending']));
  return Number(result[0].count);
}

export async function insertScrobble(
  params: {
    songId?: number;
    startTimeSecs?: number;
    operationType: string;
    trackTitle?: string;
    artistNames?: string;
  },
  trx?: DB | DBTransaction
): Promise<void> {
  const execute = async (t: DB | DBTransaction) => {
    const count = await getPendingCount(t);
    if (count >= MAX_QUEUE_SIZE) {
      logger.warn('Scrobble queue at capacity, dropping item', { count: MAX_QUEUE_SIZE });
      return;
    }

    await t.insert(scrobbleQueue).values({
      songId: params.songId ?? null,
      startTimeSecs: params.startTimeSecs != null ? Math.floor(params.startTimeSecs) : null,
      operationType: params.operationType,
      trackTitle: params.trackTitle ?? null,
      artistNames: params.artistNames ?? null,
      status: 'pending',
      retryCount: 0
    });
  };

  if (trx) {
    await execute(trx);
  } else {
    await db.transaction(async (innerTrx) => execute(innerTrx));
  }
}

export async function claimPendingBatch(
  batchSize: number,
  trx?: DB | DBTransaction
): Promise<Array<typeof scrobbleQueue.$inferSelect>> {
  const execute = async (t: DB | DBTransaction) => {
    const items = await t
      .select()
      .from(scrobbleQueue)
      .where(
        and(
          eq(scrobbleQueue.status, 'pending'),
          lte(scrobbleQueue.retryCount, MAX_RETRY_COUNT - 1)
        )
      )
      .orderBy(asc(scrobbleQueue.createdAt), asc(scrobbleQueue.id))
      .limit(batchSize);

    if (items.length > 0) {
      const ids = items.map((i) => i.id);
      await t
        .update(scrobbleQueue)
        .set({ status: 'sending' })
        .where(inArray(scrobbleQueue.id, ids));
    }

    return items;
  };

  if (trx) {
    return await execute(trx);
  } else {
    return await db.transaction(async (innerTrx) => execute(innerTrx));
  }
}

export async function markSent(id: number, trx: DB | DBTransaction = db): Promise<void> {
  await trx
    .delete(scrobbleQueue)
    .where(and(eq(scrobbleQueue.id, id), eq(scrobbleQueue.status, 'sending')));
}

export async function markFailed(id: number, trx: DB | DBTransaction = db): Promise<void> {
  await trx
    .update(scrobbleQueue)
    .set({
      status: sql`CASE WHEN retry_count + 1 >= ${MAX_RETRY_COUNT} THEN 'failed' ELSE 'pending' END`,
      retryCount: sql`retry_count + 1`,
      updatedAt: sql`NOW()`
    })
    .where(and(eq(scrobbleQueue.id, id), eq(scrobbleQueue.status, 'sending')));
}

export async function markPermanentlyFailed(id: number, trx: DB | DBTransaction = db): Promise<void> {
  await trx
    .update(scrobbleQueue)
    .set({
      status: 'failed',
      updatedAt: sql`NOW()`
    })
    .where(and(eq(scrobbleQueue.id, id), eq(scrobbleQueue.status, 'sending')));
}

export async function clearScrobbleQueue(trx: DB | DBTransaction = db): Promise<void> {
  await trx.delete(scrobbleQueue);
}

export async function resetSendingToPending(ids: number[], trx: DB | DBTransaction = db): Promise<void> {
  if (ids.length === 0) return;
  await trx
    .update(scrobbleQueue)
    .set({ status: 'pending', updatedAt: sql`NOW()` })
    .where(and(inArray(scrobbleQueue.id, ids), eq(scrobbleQueue.status, 'sending')));
}

export async function resetStuckSending(trx: DB | DBTransaction = db): Promise<void> {
  await trx
    .update(scrobbleQueue)
    .set({ status: 'pending', updatedAt: sql`NOW()` })
    .where(eq(scrobbleQueue.status, 'sending'));
}

export async function deleteOldPending(trx: DB | DBTransaction = db): Promise<void> {
  const cutoff = sql`NOW() - (${TTL_DAYS} * INTERVAL '1 day')`;
  await trx
    .delete(scrobbleQueue)
    .where(
      and(
        inArray(scrobbleQueue.status, ['pending', 'failed']),
        lte(scrobbleQueue.createdAt, cutoff)
      )
    );
}
