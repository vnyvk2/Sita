import { db } from '@db/db';
import { albums } from '@db/schema';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type {
  NormalizedQuery,
  SearchEngineOptions
} from '../../../common/search/MatchTier';
import { computeTier } from '../../../common/search/computeTier';
import type { SearchMatchReference } from '../models/SearchMatchReference';
import { fuzzySearch } from '../fuzzy/ftsFuzzySearch';

/** query normalization with all whitespace removed — matches the *_norm columns */
const normWithoutSpaces = (normalized: string) => normalized.replace(/\s+/g, '');

export const AlbumSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatchReference[]> {
    const { fuzzy = true, limit = SEARCH_LIMITS.GLOBAL } = options;
    const { escaped, normalized } = query;

    const timer = timeStart();

    // SQLite translation of the pg_trgm pipeline: raw LIKE + *_norm LIKE; the pg `%`
    // fuzzy branch is the FTS trigram-OR pool + JS pg-similarity (ftsFuzzySearch).
    const norm = normWithoutSpaces(normalized);
    const whereClause = sql`(
      ${albums.title} LIKE ${'%' + escaped + '%'} ESCAPE '\\'
      OR ${albums.titleNorm} LIKE ${'%' + norm + '%'} ESCAPE '\\'
    )`;

    const orderByClause = sql`(
      CASE
        WHEN ${albums.title} LIKE ${escaped}                THEN 6
        WHEN ${albums.title} LIKE ${escaped + '%'}          THEN 5
        WHEN ${albums.title} LIKE ${'% ' + escaped + '%'}   THEN 4
        WHEN ${albums.title} LIKE ${'%' + escaped + '%'}    THEN 3
        ELSE 1
      END
    ) DESC, ${albums.title} ASC`;

    const results = await trx.query.albums.findMany({
      columns: { id: true, title: true },
      where: () => whereClause,
      orderBy: () => orderByClause,
      limit
    });

    const references: SearchMatchReference[] = results.map((raw) => ({
      kind: 'album' as const,
      id: raw.id,
      tier: computeTier(raw.title, normalized)
    }));

    if (fuzzy && results.length < limit) {
      try {
        const fuzzyMatches = await fuzzySearch({
          baseTable: 'albums',
          textColumn: 'title',
          query: normalized,
          limit: limit - references.length,
          excludeIds: new Set(results.map((r) => r.id)),
          trx
        });
        for (const m of fuzzyMatches) {
          references.push({
            kind: 'album',
            id: m.id,
            tier: computeTier(m.text, normalized)
          });
        }
      } catch (err) {
        import('@main/logger').then(({ default: logger }) => {
          logger.warn('Fuzzy artist search failed', { err });
        });
      }
    }

    timeEnd(timer, 'Search Albums');

    return references;
  }
};
