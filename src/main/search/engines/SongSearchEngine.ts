import { db } from '@db/db';
import { songs } from '@db/schema';
import { convertToSongData } from '@main/utils/convert';
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

/** Shared relation config for song queries — eagerly loads artists, albums, genres, artworks, playlists. */
const SONG_RELATIONS = {
  artists: {
    with: {
      artist: {
        columns: { id: true, name: true }
      }
    }
  },
  albums: {
    with: {
      album: {
        columns: { id: true, title: true },
        with: {
          artists: {
            with: {
              artist: {
                columns: { id: true, name: true }
              }
            }
          }
        }
      }
    }
  },
  genres: {
    with: {
      genre: {
        columns: { id: true, name: true }
      }
    }
  },
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
  playlists: {
    with: {
      playlist: {
        columns: { id: true, name: true }
      }
    }
  }
} as const;

// ---------------------------------------------------------------------------
// Song Search Engine
// ---------------------------------------------------------------------------

/**
 * Searches songs by title. Optionally also searches by related artist/album names
 * (cross-metadata search) when `options.metadata` is provided.
 *
 * Usage:
 * - Global search: `SongSearchEngine.search(query, { metadata: { artist: true, album: true } })`
 * - Songs page:    `SongSearchEngine.search(query, { metadata: undefined })`
 */
export const SongSearchEngine = {
  async search(
    query: NormalizedQuery,
    options: SearchEngineOptions = {},
    trx: DB | DBTransaction = db
  ): Promise<SearchMatch<SongData>[]> {
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

    const titleResults = await trx.query.songs.findMany({
      where: () => titleWhereClause,
      orderBy: () => titleOrderBy,
      limit,
      with: SONG_RELATIONS
    });

    const titleMatchIds = new Set(titleResults.map((s) => s.id));

    // --- METADATA SEARCH (artist/album name → song IDs) ---
    let metadataResults: typeof titleResults = [];

    if (metadata && (metadata.artist || metadata.album) && titleResults.length < limit) {
      const remaining = Math.min(limit - titleResults.length, SEARCH_LIMITS.METADATA);

      // Build WHERE conditions based on which metadata fields are enabled
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
        // Lightweight query: just song IDs via joins
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

        // Fetch full song data for metadata-matched IDs
        if (newIds.length > 0) {
          metadataResults = await trx.query.songs.findMany({
            where: () =>
              sql`${songs.id} IN (${sql.join(
                newIds.map((id) => sql`${id}`),
                sql`, `
              )})`,
            with: SONG_RELATIONS,
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

    // --- BUILD RESULTS with per-item tiers ---
    const results: SearchMatch<SongData>[] = [];

    // Title-matched songs: compute tier from title comparison
    for (const raw of titleResults) {
      const song = convertToSongData(raw);
      const tier = computeTier(raw.title, normalized);
      results.push({ item: song, tier });
    }

    // Metadata-matched songs: always tier METADATA
    for (const raw of metadataResults) {
      const song = convertToSongData(raw);
      results.push({ item: song, tier: MATCH_TIER.METADATA });
    }

    return results;
  }
};
