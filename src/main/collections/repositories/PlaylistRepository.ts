import { db } from '@db/db';
import { playlists, playlistEntries, songs, artists, artistsSongs } from '@db/schema';
import { eq, and, gte, inArray, sql, asc, desc, lte } from 'drizzle-orm';
import type { PlaylistViewMode } from '../../../common/collections/types';
import { MembershipBootstrap } from '../../membership/bootstrap/MembershipBootstrap';
import type { ExportEntry } from '../../playlistExport/formatters/PlaylistFormatter';
import logger from '../../logger';

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

  public async getChildren(parentId: number | null, trx: DB | DBTransaction = db) {
    return await trx
      .select()
      .from(playlists)
      .where(
        parentId === null 
          ? sql`${playlists.parentId} IS NULL`
          : eq(playlists.parentId, parentId)
      )
      .orderBy(asc(playlists.id));
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
    options: { limit?: number; offset?: number; sortType?: PlaylistViewMode } = {},
    trx: DB | DBTransaction = db
  ) {
    const sortColumn =
      options.sortType === 'originalOrder'
        ? asc(playlistEntries.id)
        : asc(playlistEntries.position);

    let q = trx
      .select({
        entry: playlistEntries,
        song: songs
      })
      .from(playlistEntries)
      .innerJoin(songs, eq(playlistEntries.songId, songs.id))
      .where(eq(playlistEntries.playlistId, playlistId))
      .orderBy(sortColumn)
      .$dynamic();
      
    if (options.limit !== undefined) {
      q = q.limit(options.limit);
    }
    if (options.offset !== undefined) {
      q = q.offset(options.offset);
    }
    
    return await q;
  }

  public async getExportEntries(
    playlistId: number,
    options: { sortType?: PlaylistViewMode } = {},
    trx: DB | DBTransaction = db
  ): Promise<ExportEntry[]> {
    const entries = await this.getEntries(playlistId, options, trx);
    if (entries.length === 0) return [];

    const songArtistsRecords = await trx
      .selectDistinct({ songId: artistsSongs.songId, artistName: artists.name })
      .from(artistsSongs)
      .innerJoin(artists, eq(artistsSongs.artistId, artists.id))
      .innerJoin(playlistEntries, eq(artistsSongs.songId, playlistEntries.songId))
      .where(eq(playlistEntries.playlistId, playlistId));

    const artistsMap = new Map<number, string[]>();
    for (const record of songArtistsRecords) {
      const existing = artistsMap.get(record.songId) || [];
      if (!existing.includes(record.artistName)) {
        existing.push(record.artistName);
        artistsMap.set(record.songId, existing);
      }
    }

    return entries.map((e) => {
      const songArtists = artistsMap.get(e.song.id);
      const artist = songArtists && songArtists.length > 0 ? songArtists.join(', ') : undefined;

      return {
        title: e.song.title,
        artist,
        duration: Number(e.song.duration),
        resolvedPath: e.song.path
      };
    });
  }


  public async getMaxPosition(playlistId: number, trx: DB | DBTransaction = db): Promise<number> {
    const [result] = await trx
      .select({ maxPos: sql<number>`max(${playlistEntries.position})` })
      .from(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId));
    
    return result?.maxPos ?? -1;
  }

  public async countEntries(playlistId: number, trx: DB | DBTransaction = db): Promise<number> {
    if (trx !== db) {
      const [result] = await trx
        .select({ count: sql<number>`count(*)::int` })
        .from(playlistEntries)
        .where(eq(playlistEntries.playlistId, playlistId));
      return result?.count ?? 0;
    }

    const container = await MembershipBootstrap.getInstance();
    return container.service.countMembers({ kind: 'playlist', id: playlistId }, 'song');
  }

  public async countAll(trx: DB | DBTransaction = db): Promise<number> {
    const [result] = await trx
      .select({ count: sql<number>`count(*)::int` })
      .from(playlists);
      
    return result?.count ?? 0;
  }

  public async getPlaylistsForSong(songId: number, trx: DB | DBTransaction = db): Promise<number[]> {
    if (trx !== db) {
      const results = await trx
        .select({ playlistId: playlistEntries.playlistId })
        .from(playlistEntries)
        .where(eq(playlistEntries.songId, songId));
      return results.map((r) => r.playlistId);
    }

    const container = await MembershipBootstrap.getInstance();
    const collections = await container.service.getCollectionsContaining(
      { kind: 'song', id: songId },
      'playlist'
    );
    return collections.map((c) => Number(c.id));
  }

  public async getPlaylistsForSongs(
    songIds: readonly number[],
    trx: DB | DBTransaction = db
  ): Promise<{ songId: number; playlistId: number }[]> {
    if (songIds.length === 0) return [];

    if (trx !== db) {
      const CHUNK_SIZE = 500;
      const results: { songId: number; playlistId: number }[] = [];
      for (let i = 0; i < songIds.length; i += CHUNK_SIZE) {
        const chunk = songIds.slice(i, i + CHUNK_SIZE);
        const rows = await trx
          .select({
            songId: playlistEntries.songId,
            playlistId: playlistEntries.playlistId
          })
          .from(playlistEntries)
          .where(inArray(playlistEntries.songId, chunk as number[]));
        results.push(...rows);
      }
      return results;
    }

    const container = await MembershipBootstrap.getInstance();
    const songRefs = songIds.map((id) => ({ kind: 'song' as const, id }));
    const collectionsMap = await container.service.getCollectionsContainingMany(songRefs, 'playlist');

    const results: { songId: number; playlistId: number }[] = [];
    for (const songId of songIds) {
      const cols = collectionsMap.get(songId) ?? [];
      for (const col of cols) {
        results.push({ songId, playlistId: Number(col.id) });
      }
    }

    return results;
  }

  public async createPlaylist(data: NewPlaylist, trx: DB | DBTransaction = db) {
    const [inserted] = await trx
      .insert(playlists)
      .values(data)
      .returning();
      
    return inserted;
  }

  public async restorePlaylistWithId(data: typeof playlists.$inferSelect, trx: DB | DBTransaction = db) {
    const [inserted] = await trx
      .insert(playlists)
      .values(data)
      .overridingSystemValue()
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
      
    logger.info('[PlaylistRepository] deletePlaylist executed', { playlistId, deleted: !!deleted });
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

    const CHUNK_SIZE = 500;
    const deletedEntries: typeof playlistEntries.$inferSelect[] = [];

    for (let i = 0; i < entryIds.length; i += CHUNK_SIZE) {
      const chunk = entryIds.slice(i, i + CHUNK_SIZE);
      const deleted = await trx
        .delete(playlistEntries)
        .where(inArray(playlistEntries.id, chunk))
        .returning();
      deletedEntries.push(...deleted);
    }
    
    return deletedEntries;
  }

  public async clearPlaylistEntries(playlistId: number, trx: DB | DBTransaction = db) {
    return await trx
      .delete(playlistEntries)
      .where(eq(playlistEntries.playlistId, playlistId))
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

  public async applyStatisticsDelta(
    playlistId: number, 
    deltas: { itemCountDelta: number; durationDelta: number },
    trx: DB | DBTransaction = db
  ): Promise<void> {
    if (deltas.itemCountDelta === 0 && deltas.durationDelta === 0) return;

    await trx
      .update(playlists)
      .set({
        itemCount: sql`${playlists.itemCount} + ${deltas.itemCountDelta}`,
        totalDuration: sql`(${playlists.totalDuration} + ${deltas.durationDelta})::decimal(12,3)`,
        updatedAt: new Date()
      })
      .where(eq(playlists.id, playlistId));
  }

  public async computeStatisticsDelta(songIds: readonly number[], trx: DB | DBTransaction = db): Promise<{ itemCountDelta: number; durationDelta: number }> {
    if (songIds.length === 0) return { itemCountDelta: 0, durationDelta: 0 };

    const uniqueSongIds = Array.from(new Set(songIds));
    const CHUNK_SIZE = 500;
    const songRows: { id: number; duration: number | null }[] = [];

    for (let i = 0; i < uniqueSongIds.length; i += CHUNK_SIZE) {
      const chunk = uniqueSongIds.slice(i, i + CHUNK_SIZE);
      const rows = await trx
        .select({ id: songs.id, duration: songs.duration })
        .from(songs)
        .where(inArray(songs.id, chunk));
      songRows.push(...rows);
    }

    const durationMap = new Map(songRows.map(r => [r.id, r.duration || 0]));
    
    let durationDelta = 0;
    for (const id of songIds) {
      durationDelta += Number(durationMap.get(id)) || 0;
    }

    return {
      itemCountDelta: songIds.length,
      durationDelta
    };
  }
}
