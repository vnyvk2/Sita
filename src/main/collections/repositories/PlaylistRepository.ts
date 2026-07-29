import { db } from '@db/db';
import { playlists, playlistEntries, songs } from '@db/schema';
import { eq, and, gte, inArray, sql, asc, desc, lte } from 'drizzle-orm';

export type NewPlaylist = typeof playlists.$inferInsert;
export type NewPlaylistEntry = typeof playlistEntries.$inferInsert;

export class PlaylistRepository {
  public async getById(playlistId: number, trx: DB | DBTransaction = db) {
    const [playlist] = await trx
      .select()
      .from(playlists)
      .where(eq(playlists.id, playlistId));
    
    return playlist || null;
  }

  public async getAll(options: { limit?: number; offset?: number } = {}, trx: DB | DBTransaction = db) {
    // We cannot use await directly on the dynamic query without breaking typing easily,
    // but Drizzle allows chaining.
    let query = trx.select().from(playlists).orderBy(desc(playlists.createdAt)).$dynamic();
    
    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.offset !== undefined) query = query.offset(options.offset);
    
    return await query;
  }

  public async getEntries(
    playlistId: number,
    options: { limit?: number; offset?: number } = {},
    trx: DB | DBTransaction = db
  ) {
    let q = trx
      .select({
        entry: playlistEntries,
        song: songs
      })
      .from(playlistEntries)
      .innerJoin(songs, eq(playlistEntries.songId, songs.id))
      .where(eq(playlistEntries.playlistId, playlistId))
      .orderBy(asc(playlistEntries.position))
      .$dynamic();
      
    if (options.limit !== undefined) {
      q = q.limit(options.limit);
    }
    if (options.offset !== undefined) {
      q = q.offset(options.offset);
    }
    
    return await q;
  }

  public async getMaxPosition(playlistId: number, trx: DB | DBTransaction = db): Promise<number> {
    const [result] = await trx
      .select({ maxPos: sql<number>`max(${playlistEntries.position})` })
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));
    
    return result?.maxPos ?? -1;
  }

  public async countEntries(playlistId: number, trx: DB | DBTransaction = db): Promise<number> {
    const [result] = await trx
      .select({ count: sql<number>`count(*)::int` })
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));
      
    return result?.count ?? 0;
  }

  public async countAll(trx: DB | DBTransaction = db): Promise<number> {
    const [result] = await trx
      .select({ count: sql<number>`count(*)::int` })
      .from(playlists);
      
    return result?.count ?? 0;
  }

  public async getPlaylistsForSong(songId: number, trx: DB | DBTransaction = db): Promise<number[]> {
    const results = await trx
      .select({ playlistId: playlistEntries.playlistId })
      .from(playlistEntries)
      .where(eq(playlistEntries.songId, songId));
      
    return results.map(r => r.playlistId);
  }

  public async getPlaylistsForSongs(songIds: readonly number[], trx: DB | DBTransaction = db): Promise<{ songId: number, playlistId: number }[]> {
    if (songIds.length === 0) return [];

    return await trx
      .select({ 
        songId: playlistEntries.songId,
        playlistId: playlistEntries.playlistId 
      })
      .from(playlistEntries)
      .where(inArray(playlistEntries.songId, songIds as number[]));
  }

  public async createPlaylist(data: NewPlaylist, trx: DB | DBTransaction = db) {
    const [inserted] = await trx
      .insert(playlists)
      .values(data)
      .returning();
      
    return inserted;
  }

  public async updatePlaylist(playlistId: number, data: Partial<NewPlaylist>, trx: DB | DBTransaction = db) {
    const [updated] = await trx
      .update(playlists)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(playlists.id, playlistId))
      .returning();
      
    return updated;
  }

  public async deletePlaylist(playlistId: number, trx: DB | DBTransaction = db) {
    const [deleted] = await trx
      .delete(playlists)
      .where(eq(playlists.id, playlistId))
      .returning();
      
    return deleted || null;
  }

  public async insertEntries(entries: NewPlaylistEntry[], trx: DB | DBTransaction = db) {
    if (entries.length === 0) return [];
    
    return await trx
      .insert(playlistEntries)
      .values(entries)
      .returning();
  }

  public async deleteEntries(entryIds: number[], trx: DB | DBTransaction = db) {
    if (entryIds.length === 0) return [];
    
    return await trx
      .delete(playlistEntries)
      .where(inArray(playlistEntries.id, entryIds))
      .returning();
  }

  public async shiftPositions(playlistId: number, startPos: number, offset: number, trx: DB | DBTransaction = db) {
    await trx
      .update(playlistEntries)
      .set({ position: sql`${playlistEntries.position} + ${offset}` })
      .where(
        and(
          eq(playlistEntries.playlistId, playlistId),
          gte(playlistEntries.position, startPos)
        )
      );
  }

  public async shiftPositionsRange(playlistId: number, startPos: number, endPos: number, offset: number, trx: DB | DBTransaction = db) {
    await trx
      .update(playlistEntries)
      .set({ position: sql`${playlistEntries.position} + ${offset}` })
      .where(
        and(
          eq(playlistEntries.playlistId, playlistId),
          gte(playlistEntries.position, startPos),
          lte(playlistEntries.position, endPos)
        )
      );
  }

  public async updateEntryPosition(entryId: number, newPosition: number, trx: DB | DBTransaction = db) {
    await trx
      .update(playlistEntries)
      .set({ position: newPosition })
      .where(eq(playlistEntries.id, entryId));
  }

  public async recalculatePlaylistStatistics(playlistId: number, trx: DB | DBTransaction = db) {
    const [stats] = await trx
      .select({
        count: sql<number>`count(*)::int`,
        duration: sql<number>`sum(COALESCE(${songs.duration}, 0))::int`
      })
      .from(playlistEntries)
      .innerJoin(songs, eq(playlistEntries.songId, songs.id))
      .where(eq(playlistEntries.playlistId, playlistId));

    await trx
      .update(playlists)
      .set({
        itemCount: stats?.count ?? 0,
        totalDuration: (stats?.duration ?? 0).toString(),
        updatedAt: new Date()
      })
      .where(eq(playlists.id, playlistId));
  }
}
