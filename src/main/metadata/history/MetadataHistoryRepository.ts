import { desc, eq, inArray } from 'drizzle-orm';

import { db } from '../../db/db';
import { metadataUndoSnapshots } from '../../db/schema';
import type { MetadataHistorySnapshot } from './MetadataHistoryService';

interface StoredSnapshotPayload {
  previousSongs: MetadataHistorySnapshot['previousSongs'];
  updatedSongs: MetadataHistorySnapshot['updatedSongs'];
  songIds?: number[];
}

/**
 * Durable storage for metadata undo snapshots.
 *
 * Rows are ordered by an identity `seq`; the service layer keeps at most
 * `maxStackSize` newest snapshots, so no pruning happens here.
 */
export class MetadataHistoryRepository {
  private readonly database: typeof db;

  constructor(database: typeof db = db) {
    this.database = database;
  }

  public async insert(snapshot: MetadataHistorySnapshot): Promise<void> {
    const payload: StoredSnapshotPayload = {
      previousSongs: snapshot.previousSongs,
      updatedSongs: snapshot.updatedSongs,
      ...(snapshot.songIds !== undefined && { songIds: snapshot.songIds })
    };

    await this.database
      .insert(metadataUndoSnapshots)
      .values({
        id: snapshot.id,
        description: snapshot.description,
        albumTitle: snapshot.albumTitle,
        payload
      })
      .onConflictDoNothing({ target: metadataUndoSnapshots.id });
  }

  /** Newest first. */
  public async listNewestFirst(limit: number): Promise<MetadataHistorySnapshot[]> {
    if (limit <= 0) return [];

    const rows = await this.database
      .select()
      .from(metadataUndoSnapshots)
      .orderBy(desc(metadataUndoSnapshots.seq))
      .limit(limit);

    return rows.map((row) => this.rowToSnapshot(row));
  }

  public async deleteByIds(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.database.delete(metadataUndoSnapshots).where(inArray(metadataUndoSnapshots.id, ids));
  }

  public async deleteById(id: string): Promise<void> {
    await this.database.delete(metadataUndoSnapshots).where(eq(metadataUndoSnapshots.id, id));
  }

  public async clearAll(): Promise<void> {
    await this.database.delete(metadataUndoSnapshots);
  }

  private rowToSnapshot(row: {
    id: string;
    description: string;
    albumTitle: string | null;
    payload: StoredSnapshotPayload;
    createdAt: Date;
  }): MetadataHistorySnapshot {
    return {
      id: row.id,
      timestamp: row.createdAt.getTime(),
      description: row.description,
      ...(row.albumTitle !== null && { albumTitle: row.albumTitle }),
      previousSongs: row.payload.previousSongs ?? [],
      updatedSongs: row.payload.updatedSongs ?? [],
      ...(row.payload.songIds !== undefined && { songIds: row.payload.songIds })
    };
  }
}
