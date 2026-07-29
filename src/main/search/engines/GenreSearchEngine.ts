import { db } from '@db/db';
import { genres } from '@db/schema';
import { convertToGenre } from '@main/utils/convert';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type {
  NormalizedQuery,
  SearchEngineOptions,
  SearchMatch
} from '../../../common/search/MatchTier';
import { computeTier } from '../../../common/search/computeTier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Genre Search Engine
// ---------------------------------------------------------------------------

export const GenreSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatch<Genre>[]> {
    const { fuzzy = true, limit = SEARCH_LIMITS.GLOBAL } = options;
    const { escaped, normalized } = query;

    const timer = timeStart();

    const whereClause = fuzzy
      ? sql`(${genres.nameCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${genres.nameCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'} OR ${genres.nameCI} % ${normalized})`
      : sql`(${genres.nameCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${genres.nameCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`;

    const orderByClause = sql`(
      CASE
        WHEN ${genres.nameCI} ILIKE ${escaped}                THEN 6
        WHEN ${genres.nameCI} ILIKE ${escaped + '%'}          THEN 5
        WHEN ${genres.nameCI} ILIKE ${'% ' + escaped + '%'}  THEN 4
        WHEN ${genres.nameCI} ILIKE ${'%' + escaped + '%'}   THEN 3
        ELSE 1
      END
    ) DESC, similarity(${genres.nameCI}, ${normalized}) DESC`;

    const results = await trx.query.genres.findMany({
      where: () => whereClause,
      orderBy: () => orderByClause,
      limit,
      with: {
        songs: { with: { song: { columns: { id: true, title: true } } } },
        artworks: {
          with: {
            artwork: {
              with: {
                palette: {
                  columns: { id: true },
                  with: {
                    swatches: {}
                  }
                }
              }
            }
          }
        }
      }
    });

    timeEnd(timer, 'Search Genres');

    return results.map((raw) => ({
      item: convertToGenre(raw),
      tier: computeTier(raw.name, normalized)
    }));
  }
};
