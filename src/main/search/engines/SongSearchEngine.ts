import { db } from '@db/db';
import { songs } from '@db/schema';
import { rawAll } from '@db/sqlite/raw';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { MATCH_TIER, SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type {
  NormalizedQuery,
  SearchEngineOptions
} from '../../../common/search/MatchTier';
import { computeTier } from '../../../common/search/computeTier';
import type { SearchMatchReference } from '../models/SearchMatchReference';
import { fuzzySearch } from '../fuzzy/ftsFuzzySearch';

/** query normalization with all whitespace removed — matches the *_norm columns */
const normWithoutSpaces = (normalized: string) => normalized.replace(/\s+/g, '');

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
    // SQLite translation of the pg_trgm pipeline (ILIKE + regexp_replace + %):
    //   1. raw LIKE (ASCII case-insensitive) covers exact/prefix/substring
    //   2. title_norm LIKE covers punctuation/space-insensitive matches
    //   3. the pg_trgm `%` fuzzy branch is replaced by the FTS trigram-OR pool +
    //      JS pg-similarity scoring (ftsFuzzySearch), merged below when fuzzy=true
    const norm = normWithoutSpaces(normalized);
    const titleWhereClause = sql`(
      ${songs.title} LIKE ${'%' + escaped + '%'} ESCAPE '\\'
      OR ${songs.titleNorm} LIKE ${'%' + norm + '%'} ESCAPE '\\'
    )`;

    const titleOrderBy = sql`(
      CASE
        WHEN ${songs.title} LIKE ${escaped}                       THEN 6
        WHEN ${songs.title} LIKE ${escaped + '%'}                 THEN 5
        WHEN ${songs.title} LIKE ${'% ' + escaped + '%'}          THEN 4
        WHEN ${songs.title} LIKE ${'%' + escaped + '%'}           THEN 3
        ELSE 1
      END
    ) DESC, ${songs.title} ASC`;

    // Select ONLY id and title for tier computation (no relation joins!)
    const titleResults = await trx.query.songs.findMany({
      columns: { id: true, title: true },
      where: () => titleWhereClause,
      orderBy: () => titleOrderBy,
      limit
    });

    const titleMatchIds = new Set(titleResults.map((s) => s.id));
    const references: SearchMatchReference[] = titleResults.map((raw) => ({
      kind: 'song' as const,
      id: raw.id,
      tier: computeTier(raw.title, normalized)
    }));

    // --- FUZZY (pg_trgm `%` replacement): fill remaining slots with similar titles ---
    if (fuzzy && titleResults.length < limit) {
      try {
        const fuzzyMatches = await fuzzySearch({
          baseTable: 'songs',
          textColumn: 'title',
          query: normalized,
          limit: limit - references.length,
          excludeIds: titleMatchIds,
          trx
        });
        for (const m of fuzzyMatches) {
          titleMatchIds.add(m.id);
          // original pg path computed tiers over every title hit, fuzzy ones included
          references.push({ kind: 'song', id: m.id, tier: computeTier(m.text, normalized) });
        }
      } catch (err) {
        import('@main/logger').then(({ default: logger }) => {
          logger.warn('Fuzzy song search failed', { err });
        });
      }
    }

    // --- METADATA SEARCH (artist/album name → song IDs) ---
    let metadataResults: { id: number; title: string }[] = [];

    if (metadata && (metadata.artist || metadata.album) && references.length < limit) {
      const remaining = Math.min(limit - references.length, SEARCH_LIMITS.METADATA);

      const metaConditions = [];
      if (metadata.artist) {
        metaConditions.push(
          sql`(a.name LIKE ${'%' + escaped + '%'} ESCAPE '\\' OR a.name_norm LIKE ${'%' + norm + '%'} ESCAPE '\\')`
        );
      }
      if (metadata.album) {
        metaConditions.push(
          sql`(al.title LIKE ${'%' + escaped + '%'} ESCAPE '\\' OR al.title_norm LIKE ${'%' + norm + '%'} ESCAPE '\\')`
        );
      }

      const metaWhereClause =
        metaConditions.length === 1
          ? metaConditions[0]
          : sql`(${sql.join(metaConditions, sql` OR `)})`;

      try {
        const metaIdRows = await rawAll<{ id: number }>(sql`
          SELECT DISTINCT s.id FROM songs s
          LEFT JOIN artists_songs ars ON s.id = ars.song_id
          LEFT JOIN artists a ON ars.artist_id = a.id
          LEFT JOIN album_songs als ON s.id = als.song_id
          LEFT JOIN albums al ON als.album_id = al.id
          WHERE ${metaWhereClause}
          LIMIT ${remaining + titleMatchIds.size}
        `);

        const newIds = metaIdRows
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
