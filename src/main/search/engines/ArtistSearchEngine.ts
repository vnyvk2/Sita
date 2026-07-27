import { db } from '@db/db';
import { artists } from '@db/schema';
import { convertToArtist } from '@main/utils/convert';
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

import { normalizeForSearch } from '../../../common/search/normalizeForSearch';

function computeTier(text: string, keyword: string): MatchTierValue {
  const t = normalizeForSearch(text);
  const k = normalizeForSearch(keyword);
  if (t === k) return MATCH_TIER.EXACT;
  if (t.startsWith(k)) return MATCH_TIER.PREFIX;
  if (t.includes(' ' + k)) return MATCH_TIER.WORD_PREFIX;
  if (t.includes(k)) return MATCH_TIER.CONTAINS;
  return MATCH_TIER.FUZZY;
}

// ---------------------------------------------------------------------------
// Artist Search Engine
// ---------------------------------------------------------------------------

export const ArtistSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatch<Artist>[]> {
    const { fuzzy = true, limit = SEARCH_LIMITS.GLOBAL } = options;
    const { escaped, normalized } = query;

    const timer = timeStart();

    const whereClause = fuzzy
      ? sql`(${artists.nameCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${artists.nameCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'} OR ${artists.nameCI} % ${normalized})`
      : sql`(${artists.nameCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${artists.nameCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`;

    const orderByClause = sql`(
      CASE
        WHEN ${artists.nameCI} ILIKE ${escaped}                THEN 6
        WHEN ${artists.nameCI} ILIKE ${escaped + '%'}          THEN 5
        WHEN ${artists.nameCI} ILIKE ${'% ' + escaped + '%'}  THEN 4
        WHEN ${artists.nameCI} ILIKE ${'%' + escaped + '%'}   THEN 3
        ELSE 1
      END
    ) DESC, similarity(${artists.nameCI}, ${normalized}) DESC`;

    const results = await trx.query.artists.findMany({
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
        },
        albums: {
          with: {
            album: {
              columns: {
                title: true,
                id: true
              }
            }
          }
        }
      }
    });

    timeEnd(timer, 'Search Artists');

    return results.map((raw) => ({
      item: convertToArtist(raw),
      tier: computeTier(raw.name, normalized)
    }));
  }
};
