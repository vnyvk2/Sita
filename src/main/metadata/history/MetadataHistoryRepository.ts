import { desc, eq, inArray } from 'drizzle-orm';

import type { DB, DBTransaction } from '../../db/db';
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

  /**
   * Inserts a snapshot. When `trx` is provided the row joins the caller's
   * transaction, so an undo journal entry is committed atomically with the
   * mutation it covers (P0 #3) - a crash can never leave DB=new / undo=missing.
   */
  public async insert(
    snapshot: MetadataHistorySnapshot,
    trx: DB | DBTransaction = this.database
  ): Promise<void> {
    const payload: StoredSnapshotPayload = {
      previousSongs: snapshot.previousSongs,
      updatedSongs: snapshot.updatedSongs,
      ...(snapshot.songIds !== undefined && { songIds: snapshot.songIds })
    };

    await trx
      .insert(metadataUndoSnapshots)
      .values({
        id: snapshot.id,
        description: snapshot.description,
        albumTitle: snapshot.albumTitle,
        payload
      })
      .onConflictDoNothing({ target: metadataUndoSnapshots.id });
  }

  /**
   * Grouped mode: appends one song's pre/post snapshots to a single journal
   * row, creating the row on first sight. Called inside each per-song
   * transaction so partial group failures still leave durable undo coverage
   * for every song that actually committed (P0 #2).
   */
  public async appendToSnapshot(
    args: {
      id: string;
      description: string;
      albumTitle?: string;
      previousSong: MetadataHistorySnapshot['previousSongs'][number];
      updatedSong: MetadataHistorySnapshot['updatedSongs'][number];
    },
    trx: DB | DBTransaction = this.database
  ): Promise<void> {
    const [row] = await trx.select().from(metadataUndoSnapshots).where(eq(metadataUndoSnapshots.id, args.id));

    if (!row) {
      const payload: StoredSnapshotPayload = {
        previousSongs: [args.previousSong],
        updatedSongs: [args.updatedSong],
        songIds: [args.previousSong.songId]
      };
      await trx.insert(metadataUndoSnapshots).values({
        id: args.id,
        description: args.description,
        albumTitle: args.albumTitle,
        payload
      });
      return;
    }

    const existing = row.payload ?? { previousSongs: [], updatedSongs: [] };
    await trx
      .update(metadataUndoSnapshots)
      .set({
        payload: {
          previousSongs: [...existing.previousSongs, args.previousSong],
          updatedSongs: [...existing.updatedSongs, args.updatedSong],
          songIds: [...(existing.songIds ?? []), args.previousSong.songId]
        } as never
      })
      .where(eq(metadataUndoSnapshots.id, args.id));
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
