import { db } from '@db/db';
import { songs } from '@db/schema';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { MATCH_TIER, SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type {
  NormalizedQuery,
  SearchEngineOptions
} from '../../../common/search/MatchTier';
import { computeTier } from '../../../common/search/computeTier';
import type { SearchMatchReference } from '../models/SearchMatchReference';

export const SongSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatchReference[]> {
    const { fuzzy = true, limit = SEARCH_LIMITS.GLOBAL, metadata } = options;
    const { escaped, normalized } = query;

    const timer = timeStart();

    // --- TITLE SEARCH ---
    const titleWhereClause = fuzzy
      ? sql`(${songs.titleCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${songs.titleCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'} OR ${songs.titleCI} % ${normalized})`
      : sql`(${songs.titleCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${songs.titleCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`;

    const titleOrderBy = sql`(
      CASE
        WHEN ${songs.titleCI} ILIKE ${escaped}                THEN 6
        WHEN ${songs.titleCI} ILIKE ${escaped + '%'}          THEN 5
        WHEN ${songs.titleCI} ILIKE ${'% ' + escaped + '%'}  THEN 4
        WHEN ${songs.titleCI} ILIKE ${'%' + escaped + '%'}   THEN 3
        ELSE 1
      END
    ) DESC, similarity(${songs.titleCI}, ${normalized}) DESC`;

    // Select ONLY id and title for tier computation (no relation joins!)
    const titleResults = await trx.query.songs.findMany({
      columns: { id: true, title: true },
      where: () => titleWhereClause,
      orderBy: () => titleOrderBy,
      limit
    });

    const titleMatchIds = new Set(titleResults.map((s) => s.id));

    // --- METADATA SEARCH (artist/album name → song IDs) ---
    let metadataResults: typeof titleResults = [];

    if (metadata && (metadata.artist || metadata.album) && titleResults.length < limit) {
      const remaining = Math.min(limit - titleResults.length, SEARCH_LIMITS.METADATA);

      const metaConditions: ReturnType<typeof sql>[] = [];
      if (metadata.artist) {
        metaConditions.push(sql`(a.name_ci ILIKE ${'%' + escaped + '%'} OR regexp_replace(a.name_ci, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`);
      }
      if (metadata.album) {
        metaConditions.push(sql`(al.title_ci ILIKE ${'%' + escaped + '%'} OR regexp_replace(al.title_ci, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`);
      }

      const metaWhereClause =
        metaConditions.length === 1
          ? metaConditions[0]
          : sql`(${sql.join(metaConditions, sql` OR `)})`;

      try {
        const metaIdRows = await trx.execute<{ id: number }>(sql`
          SELECT DISTINCT s.id FROM songs s
          LEFT JOIN artists_songs ars ON s.id = ars.song_id
          LEFT JOIN artists a ON ars.artist_id = a.id
          LEFT JOIN album_songs als ON s.id = als.song_id
          LEFT JOIN albums al ON als.album_id = al.id
          WHERE ${metaWhereClause}
          LIMIT ${remaining + titleMatchIds.size}
        `);

        const newIds = metaIdRows.rows
          .map((r) => r.id)
          .filter((id) => !titleMatchIds.has(id))
          .slice(0, remaining);

        if (newIds.length > 0) {
          metadataResults = await trx.query.songs.findMany({
            columns: { id: true, title: true },
            where: () =>
              sql`${songs.id} IN (${sql.join(
                newIds.map((id) => sql`${id}`),
                sql`, `
              )})`,
            limit: newIds.length
          });
        }
      } catch (err) {
        import('@main/logger').then(({ default: logger }) => {
          logger.warn('Metadata cross-search failed', { err });
        });
      }
    }

    timeEnd(timer, 'Search Songs');

    const references: SearchMatchReference[] = [];

    for (const raw of titleResults) {
      const tier = computeTier(raw.title, normalized);
      references.push({
        kind: 'song',
        id: raw.id,
        tier
      });
    }

    for (const raw of metadataResults) {
      references.push({
        kind: 'song',
        id: raw.id,
        tier: MATCH_TIER.METADATA
      });
    }

    return references;
  }
};
