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

export const AlbumSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatchReference[]> {
    const { fuzzy = true, limit = SEARCH_LIMITS.GLOBAL } = options;
    const { escaped, normalized } = query;

    const timer = timeStart();

    const whereClause = fuzzy
      ? sql`(${albums.titleCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${albums.titleCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'} OR ${albums.titleCI} % ${normalized})`
      : sql`(${albums.titleCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${albums.titleCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`;

    const orderByClause = sql`(
      CASE
        WHEN ${albums.titleCI} ILIKE ${escaped}                THEN 6
        WHEN ${albums.titleCI} ILIKE ${escaped + '%'}          THEN 5
        WHEN ${albums.titleCI} ILIKE ${'% ' + escaped + '%'}  THEN 4
        WHEN ${albums.titleCI} ILIKE ${'%' + escaped + '%'}   THEN 3
        ELSE 1
      END
    ) DESC, similarity(${albums.titleCI}, ${normalized}) DESC`;

    const results = await trx.query.albums.findMany({
      columns: { id: true, title: true },
      where: () => whereClause,
      orderBy: () => orderByClause,
      limit
    });

    timeEnd(timer, 'Search Albums');

    return results.map((raw) => ({
      kind: 'album' as const,
      id: raw.id,
      tier: computeTier(raw.title, normalized)
    }));
  }
};
