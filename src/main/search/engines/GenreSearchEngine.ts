import { db } from '@db/db';
import { genres } from '@db/schema';
import { convertToGenre } from '@main/utils/convert';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { MATCH_TIER, SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type {
  MatchTierValue,
  NormalizedQuery,
  SearchEngineOptions,
  SearchMatch
} from '../../../common/search/MatchTier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeTier(text: string, keyword: string): MatchTierValue {
  const t = text.toLowerCase();
  const k = keyword.toLowerCase();
  if (t === k) return MATCH_TIER.EXACT;
  if (t.startsWith(k)) return MATCH_TIER.PREFIX;
  if (t.includes(' ' + k)) return MATCH_TIER.WORD_PREFIX;
  if (t.includes(k)) return MATCH_TIER.CONTAINS;
  return MATCH_TIER.FUZZY;
}

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
      ? sql`(${genres.nameCI} ILIKE ${'%' + escaped + '%'} OR ${genres.nameCI} % ${normalized})`
      : sql`${genres.nameCI} ILIKE ${'%' + escaped + '%'}`;

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
