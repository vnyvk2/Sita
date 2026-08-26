import { eq } from 'drizzle-orm';

import type { DB, DBTransaction } from '../../db/db';
import { db } from '../../db/db';
import { metadataPendingWrites } from '../../db/schema';

/**
 * Durable storage for deferred metadata file writes.
 *
 * Lifecycle: a write is blocked (song currently playing) -> durable work item
 * persisted -> retried on flush triggers -> row DELETED on success.
 *
 * Coalescing invariant: one row per song path. The in-memory queue performs
 * field-level merging before persisting; the durable layer stores the full
 * merged TagData so an item is self-contained and idempotently replayable
 * after restart.
 */
export class MetadataPendingWritesRepository {
  private readonly database: typeof db;

  constructor(database: typeof db = db) {
    this.database = database;
  }

  /**
   * Inserts or replaces the pending item for a song path (latest wins).
   * When `trx` is provided, the durable deferral joins the caller's
   * transaction so the pending write commits atomically WITH the DB mutation
   * it mirrors (P0 #1) - a rejected insert now fails the whole apply instead
   * of silently losing the deferred file write.
   */
  public async upsert(
    item: {
      id: string;
      songPath: string;
      tags: Record<string, unknown>;
      isKnownSource: boolean;
    },
    trx: DB | DBTransaction = this.database
  ): Promise<void> {
    await trx
      .insert(metadataPendingWrites)
      .values({
        id: item.id,
        songPath: item.songPath,
        tags: item.tags as never,
        isKnownSource: item.isKnownSource
      })
      .onConflictDoUpdate({
        target: metadataPendingWrites.songPath,
        set: {
          tags: item.tags as never,
          isKnownSource: item.isKnownSource,
          updatedAt: new Date()
        }
      });
  }

  public async listAll(trx: DB | DBTransaction = this.database): Promise<Array<{ id: string; songPath: string; tags: Record<string, unknown>; isKnownSource: boolean }>> {
    const rows = await trx.select().from(metadataPendingWrites);
    return rows.map((r) => ({
      id: r.id,
      songPath: r.songPath,
      tags: r.tags as Record<string, unknown>,
      isKnownSource: r.isKnownSource
    }));
  }

  public async deleteBySongPath(songPath: string, trx: DB | DBTransaction = this.database): Promise<void> {
    await trx.delete(metadataPendingWrites).where(eq(metadataPendingWrites.songPath, songPath));
  }

  public async clearAll(trx: DB | DBTransaction = this.database): Promise<void> {
    await trx.delete(metadataPendingWrites);
  }
}
