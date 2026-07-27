import { db } from '@db/db';
import { albums } from '@db/schema';
import { convertToAlbum } from '@main/utils/convert';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { sql } from 'drizzle-orm';

import { MATCH_TIER, SEARCH_LIMITS } from '../../../common/search/MatchTier';
import type {
  MatchTierValue,
  NormalizedQuery,
  SearchEngineOptions,
  SearchMatch
} from '../../../common/search/MatchTier';
import { computeTier } from '../../../common/search/computeTier';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Album Search Engine
// ---------------------------------------------------------------------------

export const AlbumSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatch<Album>[]> {
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
      where: () => whereClause,
      orderBy: () => orderByClause,
      limit,
      with: {
        artists: {
          with: {
            artist: {
              columns: {
                name: true,
                id: true
              }
            }
          }
        },
        songs: { with: { song: { columns: { id: true, title: true } } } },
        artworks: {
          with: {
            artwork: {}
          }
        }
      }
    });

    timeEnd(timer, 'Search Albums');

    return results.map((raw) => ({
      item: convertToAlbum(raw),
      tier: computeTier(raw.title, normalized)
    }));
  }
};
