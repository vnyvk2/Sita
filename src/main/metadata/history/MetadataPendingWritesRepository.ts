import { eq } from 'drizzle-orm';

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

  /** Inserts or replaces the pending item for a song path (latest wins). */
  public async upsert(item: {
    id: string;
    songPath: string;
    tags: Record<string, unknown>;
    isKnownSource: boolean;
  }): Promise<void> {
    await this.database
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

  public async listAll(): Promise<Array<{ id: string; songPath: string; tags: Record<string, unknown>; isKnownSource: boolean }>> {
    const rows = await this.database.select().from(metadataPendingWrites);
    return rows.map((r) => ({
      id: r.id,
      songPath: r.songPath,
      tags: r.tags as Record<string, unknown>,
      isKnownSource: r.isKnownSource
    }));
  }

  public async deleteBySongPath(songPath: string): Promise<void> {
    await this.database.delete(metadataPendingWrites).where(eq(metadataPendingWrites.songPath, songPath));
  }

  public async clearAll(): Promise<void> {
    await this.database.delete(metadataPendingWrites);
  }
}
