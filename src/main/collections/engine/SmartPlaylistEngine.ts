import { asc, eq, and, ne } from 'drizzle-orm';

import { db } from '../../db/db';
import {
  smartPlaylistRules,
  playlistEntries,
  songs,
  playlists,
  artistsSongs,
  artists,
  albumsSongs,
  albums,
  genresSongs,
  genres
} from '../../db/schema';
import type { SmartPlaylistDefinition, SmartPlaylistRuleAST, OrderDefinition } from '../query/ast';
import { QueryPlanner } from '../query/QueryPlanner';
import { SmartPlaylistCompiler } from '../query/SmartPlaylistCompiler';
import { PlaylistRepository } from '../repositories/PlaylistRepository';

export class SmartPlaylistEngine {
  private planner = new QueryPlanner();
  private compiler = new SmartPlaylistCompiler();
  // Stateless helper for position bookkeeping (accepts an explicit trx)
  private repository = new PlaylistRepository();

  /**
   * Safely regenerates the contents of a smart playlist inside a transaction. If any step fails,
   * the entire regeneration rolls back.
   */
  public async regenerate(playlistId: number): Promise<boolean> {
    return await db.transaction(async (trx) => {
      // 1. Fetch rule
      const [ruleRecord] = await trx
        .select()
        .from(smartPlaylistRules)
        .where(eq(smartPlaylistRules.playlistId, playlistId));

      if (!ruleRecord) return false; // Not a smart playlist

      // 2. Parse definition
      const ruleAst = ruleRecord.ruleAst as SmartPlaylistRuleAST;
      const orderBy = (ruleRecord.sortDefinition as OrderDefinition[]) || [];
      const definition: SmartPlaylistDefinition = { rule: ruleAst, orderBy };

      // 3. Plan and compile
      const plan = this.planner.plan(definition);
      const predicate = this.compiler.compilePredicate(plan.rule);
      const orderBySql = this.compiler.compileOrderBy(plan.orderBy);

      // 4. Build query for songs
      let query = trx.select({ id: songs.id, duration: songs.duration }).from(songs).$dynamic();

      // Apply joins
      for (const join of plan.joins) {
        if (join.relation === 'artist') {
          query = query
            .leftJoin(artistsSongs, eq(songs.id, artistsSongs.songId))
            .leftJoin(artists, eq(artistsSongs.artistId, artists.id));
        } else if (join.relation === 'album') {
          query = query
            .leftJoin(albumsSongs, eq(songs.id, albumsSongs.songId))
            .leftJoin(albums, eq(albumsSongs.albumId, albums.id));
        } else if (join.relation === 'genre') {
          query = query
            .leftJoin(genresSongs, eq(songs.id, genresSongs.songId))
            .leftJoin(genres, eq(genresSongs.genreId, genres.id));
        }
      }

      if (predicate) {
        query = query.where(predicate);
      }

      if (orderBySql.length > 0) {
        query = query.orderBy(...orderBySql);
      }

      // Execute query to get matching song IDs
      const matchingSongs = await query;

      // Deduplicate in JS to avoid SQL DISTINCT vs ORDER BY limitations
      // Preserves the first encountered element according to the ORDER BY
      const uniqueSongs = [];
      const seen = new Set<number>();
      for (const s of matchingSongs) {
        if (!seen.has(s.id)) {
          seen.add(s.id);
          uniqueSongs.push(s);
          if (ruleRecord.maxEntries !== null && uniqueSongs.length >= ruleRecord.maxEntries) {
            break;
          }
        }
      }

      const songIds = uniqueSongs.map((s) => s.id);

      // 5. Capture the current visual order of non-smart entries (e.g. manually
      // pinned tracks co-resident with the smart block) BEFORE deleting, so
      // their relative order survives regeneration.
      const manualEntries = await trx
        .select({ id: playlistEntries.id })
        .from(playlistEntries)
        .where(and(eq(playlistEntries.playlistId, playlistId), ne(playlistEntries.source, 'smart')))
        .orderBy(asc(playlistEntries.position), asc(playlistEntries.id));

      const manualCount = manualEntries.length;

      // 6. Delete existing smart entries
      await trx
        .delete(playlistEntries)
        .where(
          and(eq(playlistEntries.playlistId, playlistId), eq(playlistEntries.source, 'smart'))
        );

      // 7. Insert new smart entries at the head (positions 0..k-1)
      if (songIds.length > 0) {
        const values = songIds.map((songId, index) => ({
          playlistId,
          songId,
          position: index,
          source: 'smart'
        }));

        // Drizzle can handle bulk inserts natively
        await trx.insert(playlistEntries).values(values);
      }

      // 8. Renumber remaining non-smart entries to directly follow the smart
      // block so stored positions stay contiguous and duplicate-free.
      if (manualCount > 0) {
        const smartBlockLength = songIds.length;
        await this.repository.updatePositionsBulk(
          playlistId,
          manualEntries.map((entry, index) => ({
            entryId: entry.id,
            position: smartBlockLength + index
          })),
          trx
        );
      }

      // 9. Update metadata (itemCount/totalDuration cover the whole playlist,
      // not just the generated smart block)
      let manualDuration = 0;
      if (manualCount > 0) {
        const manualSongRows = await trx
          .select({ duration: songs.duration })
          .from(playlistEntries)
          .innerJoin(songs, eq(playlistEntries.songId, songs.id))
          .where(
            and(eq(playlistEntries.playlistId, playlistId), ne(playlistEntries.source, 'smart'))
          );
        manualDuration = manualSongRows.reduce((sum, s) => sum + Number(s.duration ?? 0), 0);
      }
      const totalDuration = uniqueSongs.reduce((sum, s) => sum + Number(s.duration ?? 0), 0);

      await trx
        .update(playlists)
        .set({
          itemCount: songIds.length + manualCount,
          totalDuration: totalDuration + manualDuration,
          updatedAt: new Date()
        })
        .where(eq(playlists.id, playlistId));

      await trx
        .update(smartPlaylistRules)
        .set({
          lastGeneratedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(smartPlaylistRules.playlistId, playlistId));

      return true;
    });
  }
}
