import { db } from '../../db/db';
import { smartPlaylistRules, playlistEntries, songs, playlists, artistsSongs, artists, albumsSongs, albums, genresSongs, genres } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { QueryPlanner } from '../query/QueryPlanner';
import { SmartPlaylistCompiler } from '../query/SmartPlaylistCompiler';
import type { SmartPlaylistDefinition, SmartPlaylistRuleAST, OrderDefinition } from '../query/ast';

export class SmartPlaylistEngine {
  private planner = new QueryPlanner();
  private compiler = new SmartPlaylistCompiler();

  /**
   * Safely regenerates the contents of a smart playlist inside a transaction.
   * If any step fails, the entire regeneration rolls back.
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

      const songIds = uniqueSongs.map(s => s.id);
      
      // Calculate total duration
      const totalDuration = uniqueSongs.reduce((sum, s) => sum + parseFloat(s.duration || '0'), 0);

      // 5. Delete existing smart entries
      await trx
        .delete(playlistEntries)
        .where(
          and(
            eq(playlistEntries.playlistId, playlistId),
            eq(playlistEntries.source, 'smart')
          )
        );

      // 6. Insert new entries
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

      // 7. Update metadata
      await trx
        .update(playlists)
        .set({
          itemCount: songIds.length,
          totalDuration: totalDuration.toString(),
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
