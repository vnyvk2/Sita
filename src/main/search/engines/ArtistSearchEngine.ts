import { db } from '@db/db';
import { artists } from '@db/schema';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { computeTier } from '../../../common/search/computeTier';
import { SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type { NormalizedQuery, SearchEngineOptions } from '../../../common/search/MatchTier';
import { fuzzySearch } from '../fuzzy/ftsFuzzySearch';
import type { SearchMatchReference } from '../models/SearchMatchReference';

/** Query normalization with all whitespace removed — matches the *_norm columns */
const normWithoutSpaces = (normalized: string) => normalized.replace(/\s+/g, '');

export const ArtistSearchEngine = {
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
      ${artists.name} LIKE ${'%' + escaped + '%'} ESCAPE '\\'
      OR ${artists.nameNorm} LIKE ${'%' + norm + '%'} ESCAPE '\\'
    )`;

    const orderByClause = sql`(
      CASE
        WHEN ${artists.name} LIKE ${escaped}                THEN 6
        WHEN ${artists.name} LIKE ${escaped + '%'}          THEN 5
        WHEN ${artists.name} LIKE ${'% ' + escaped + '%'}   THEN 4
        WHEN ${artists.name} LIKE ${'%' + escaped + '%'}    THEN 3
        ELSE 1
      END
    ) DESC, ${artists.name} ASC`;

    const results = await trx.query.artists.findMany({
      columns: { id: true, name: true },
      where: () => whereClause,
      orderBy: () => orderByClause,
      limit
    });

    const references: SearchMatchReference[] = results.map((raw) => ({
      kind: 'artist' as const,
      id: raw.id,
      tier: computeTier(raw.name, normalized)
    }));

    if (fuzzy && results.length < limit) {
      try {
        const fuzzyMatches = await fuzzySearch({
          baseTable: 'artists',
          textColumn: 'name',
          query: normalized,
          limit: limit - references.length,
          excludeIds: new Set(results.map((r) => r.id)),
          trx
        });
        for (const m of fuzzyMatches) {
          references.push({
            kind: 'artist',
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

    timeEnd(timer, 'Search Artists');

    return references;
  }
};
