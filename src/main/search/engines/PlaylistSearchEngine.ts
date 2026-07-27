import { db } from '@db/db';
import { playlists } from '@db/schema';
import { convertToPlaylist } from '@main/utils/convert';
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
// Playlist Search Engine
// ---------------------------------------------------------------------------

export const PlaylistSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatch<Playlist>[]> {
    const { fuzzy = true, limit = SEARCH_LIMITS.GLOBAL } = options;
    const { escaped, normalized } = query;

    const timer = timeStart();

    const whereClause = fuzzy
      ? sql`(${playlists.nameCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${playlists.nameCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'} OR ${playlists.nameCI} % ${normalized})`
      : sql`(${playlists.nameCI} ILIKE ${'%' + escaped + '%'} OR regexp_replace(${playlists.nameCI}, '[[:punct:]]', '', 'g') ILIKE ${'%' + normalized + '%'})`;

    const orderByClause = sql`(
      CASE
        WHEN ${playlists.nameCI} ILIKE ${escaped}                THEN 6
        WHEN ${playlists.nameCI} ILIKE ${escaped + '%'}          THEN 5
        WHEN ${playlists.nameCI} ILIKE ${'% ' + escaped + '%'}  THEN 4
        WHEN ${playlists.nameCI} ILIKE ${'%' + escaped + '%'}   THEN 3
        ELSE 1
      END
    ) DESC, similarity(${playlists.nameCI}, ${normalized}) DESC`;

    const results = await trx.query.playlists.findMany({
      where: () => whereClause,
      orderBy: () => orderByClause,
      limit,
      with: {
        songs: { with: { song: { columns: { id: true } } } },
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

    timeEnd(timer, 'Search Playlists');

    return results.map((raw) => ({
      item: convertToPlaylist(raw),
      tier: computeTier(raw.name, normalized)
    }));
  }
};
