import type { MatchTierValue } from '../../../common/search/MatchTier';
import type { MetadataSearchGateway } from '@main/metadata/search/MetadataSearchGateway';
import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import logger from '@main/logger';
import { dataUpdateEvent } from '@main/main';
import { MetadataBootstrap } from '@main/metadata/setup';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';
import { MATCH_TIER } from '../../../common/search/MatchTier';
import { AlbumSearchEngine } from '../engines/AlbumSearchEngine';
import { ArtistSearchEngine } from '../engines/ArtistSearchEngine';
import { GenreSearchEngine } from '../engines/GenreSearchEngine';
import { PlaylistSearchEngine } from '../engines/PlaylistSearchEngine';
import { SongSearchEngine } from '../engines/SongSearchEngine';
import type { SearchMatchReference } from '../models/SearchMatchReference';
import { normalizeQuery } from '../normalize/normalizeQuery';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_REFERENCES: SearchMatchReference[] = [];

// ---------------------------------------------------------------------------
// Recent search history
// ---------------------------------------------------------------------------

let recentSearchesTimeoutId: NodeJS.Timeout;

// ---------------------------------------------------------------------------
// Search Coordinator Options & Interface
// ---------------------------------------------------------------------------

export interface SearchCoordinatorOptions {
  keyword: string;
  filter?: 'All' | 'Songs' | 'Artists' | 'Albums' | 'Playlists' | 'Genres';
  updateSearchHistory?: boolean;
  isSimilaritySearchEnabled?: boolean;
  limit?: number;
  metadata?: boolean | { artist?: boolean; album?: boolean };
  searchGateway?: MetadataSearchGateway;
}

/**
 * Nora's central search coordinator.
 *
 * Owns:
 * - Query normalization
 * - Engine selection (based on filter)
 * - Parallel engine execution (returning SearchMatchReference[])
 * - Single-pass batched hydration via MetadataSearchGateway.hydrateReferences()
 * - Section confidence computation & history tracking
 */
const query = async (options: SearchCoordinatorOptions): Promise<SearchResult> => {
  const {
    keyword,
    filter = 'All',
    updateSearchHistory = true,
    isSimilaritySearchEnabled = true,
    limit,
    metadata,
    searchGateway
  } = options;

  const timer = timeStart();
  const query = normalizeQuery(keyword);

  if (!query.normalized) {
    return {
      songs: [],
      artists: [],
      albums: [],
      playlists: [],
      genres: [],
      availableResults: [],
      confidence: { songs: 0, artists: 0, albums: 0, playlists: 0, genres: 0 }
    };
  }

  const engineOptions: import('../../../common/search/MatchTier').SearchEngineOptions = {
    fuzzy: isSimilaritySearchEnabled,
    limit,
    metadata:
      typeof metadata === 'boolean'
        ? metadata
          ? { artist: true, album: true }
          : undefined
        : metadata
  };

  // 1. Run engine discovery in parallel — returning SearchMatchReference[]
  const [songRefs, artistRefs, albumRefs, playlistRefs, genreRefs] = await Promise.all([
    filter === 'All' || filter === 'Songs'
      ? SongSearchEngine.search(query, engineOptions)
      : EMPTY_REFERENCES,
    filter === 'All' || filter === 'Artists'
      ? ArtistSearchEngine.search(query, engineOptions)
      : EMPTY_REFERENCES,
    filter === 'All' || filter === 'Albums'
      ? AlbumSearchEngine.search(query, engineOptions)
      : EMPTY_REFERENCES,
    filter === 'All' || filter === 'Playlists'
      ? PlaylistSearchEngine.search(query, engineOptions)
      : EMPTY_REFERENCES,
    filter === 'All' || filter === 'Genres'
      ? GenreSearchEngine.search(query, engineOptions)
      : EMPTY_REFERENCES
  ]);

  timeEnd(timer, 'Engine Identity Discovery');

  // 2. Aggregate ALL search references into ONE single batched pass across all engines
  const allReferences = [
    ...songRefs,
    ...artistRefs,
    ...albumRefs,
    ...playlistRefs,
    ...genreRefs
  ];

  // Fallback to MetadataBootstrap singleton searchGateway if not explicitly passed
  const activeGateway =
    searchGateway ?? (await MetadataBootstrap.getInstance()).searchGateway;

  let hydratedResults: unknown[] = [];
  if (activeGateway && allReferences.length > 0) {
    hydratedResults = await activeGateway.hydrateReferences(allReferences);
  }

  // 3. Map hydrated DTOs back into sections preserving original engine ordering
  const hydratedMap = new Map<string, unknown>();
  for (const item of hydratedResults) {
    if (item && typeof item === 'object' && 'kind' in item && 'id' in item) {
      const key = `${(item as Record<string, unknown>).kind}:${(item as Record<string, unknown>).id}`;
      hydratedMap.set(key, item);
    }
  }

  const songs = songRefs
    .map((ref) => hydratedMap.get(`song:${ref.id}`))
    .filter(Boolean);
  const artists = artistRefs
    .map((ref) => hydratedMap.get(`artist:${ref.id}`))
    .filter(Boolean);
  const albums = albumRefs
    .map((ref) => hydratedMap.get(`album:${ref.id}`))
    .filter(Boolean);
  const playlists = playlistRefs
    .map((ref) => hydratedMap.get(`playlist:${ref.id}`))
    .filter(Boolean);
  const genres = genreRefs
    .map((ref) => hydratedMap.get(`genre:${ref.id}`))
    .filter(Boolean);

  // 4. Compute section confidence from match tiers
  const bestTierOf = (refs: SearchMatchReference[]): MatchTierValue =>
    refs.length > 0 ? refs[0].tier : MATCH_TIER.NONE;

  const confidence = {
    songs: bestTierOf(songRefs),
    artists: bestTierOf(artistRefs),
    albums: bestTierOf(albumRefs),
    playlists: bestTierOf(playlistRefs),
    genres: bestTierOf(genreRefs)
  };

  logger.debug(`Searching for results.`, {
    keyword,
    filter,
    isSimilaritySearchEnabled,
    totalResults: songs.length + artists.length + albums.length + playlists.length + genres.length,
    songsResults: songs.length,
    artistsResults: artists.length,
    albumsResults: albums.length,
    playlistsResults: playlists.length,
    genresResults: genres.length,
    confidence
  });

  // 5. Recent search history
  if (updateSearchHistory) {
    if (recentSearchesTimeoutId) clearTimeout(recentSearchesTimeoutId);
    recentSearchesTimeoutId = setTimeout(async () => {
      try {
        const { recentSearches } = await getUserSettings();

        if (Array.isArray(recentSearches)) {
          if (recentSearches.includes(keyword)) {
            recentSearches.splice(recentSearches.indexOf(keyword), 1);
          }
          recentSearches.unshift(keyword);
          while (recentSearches.length > 10) recentSearches.pop();
        }

        await saveUserSettings({ recentSearches });
        dataUpdateEvent('userData/recentSearches');
      } catch (err) {
        logger.error('Failed to update recent searches', { error: err });
      }
    }, 2000);
  }

  return {
    songs,
    artists,
    albums,
    playlists,
    genres,
    availableResults: [],
    confidence
  };
};

export const SearchCoordinator = { query };
