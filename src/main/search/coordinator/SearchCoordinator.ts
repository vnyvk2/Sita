import { getUserSettings, saveUserSettings } from '@main/db/queries/settings';
import logger from '@main/logger';
import { dataUpdateEvent } from '@main/main';
import { timeEnd, timeStart } from '@main/utils/measureTimeUsage';

import { AlbumSearchEngine } from '../engines/AlbumSearchEngine';
import { ArtistSearchEngine } from '../engines/ArtistSearchEngine';
import { GenreSearchEngine } from '../engines/GenreSearchEngine';
import { PlaylistSearchEngine } from '../engines/PlaylistSearchEngine';
import { SongSearchEngine } from '../engines/SongSearchEngine';
import { normalizeQuery } from '../normalize/normalizeQuery';
import { MATCH_TIER } from '../../../common/search/MatchTier';
import type { MatchTierValue, SearchMatch } from '../../../common/search/MatchTier';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMPTY_MATCHES: SearchMatch<never>[] = [];

// ---------------------------------------------------------------------------
// Recent search history
// ---------------------------------------------------------------------------

let recentSearchesTimeoutId: NodeJS.Timeout;

// ---------------------------------------------------------------------------
// Search Coordinator
// ---------------------------------------------------------------------------

/**
 * Nora's central search coordinator.
 *
 * Owns:
 * - Query normalization
 * - Engine selection (based on filter)
 * - Parallel engine execution
 * - Section confidence computation
 * - Recent search history management
 *
 * Does NOT own:
 * - How entities are searched (that's the engines' job)
 * - How results are presented (that's the frontend's job)
 *
 * Usage:
 * - Global search:  `query({ keyword, filter: 'All', updateSearchHistory: true })`
 * - Songs page:     `query({ keyword, filter: 'Songs', updateSearchHistory: false, limit: SEARCH_LIMITS.PAGE })`
 */
const query = async (options: SearchCoordinatorOptions): Promise<SearchResult> => {
  const {
    keyword,
    filter = 'All',
    updateSearchHistory = true,
    isSimilaritySearchEnabled = true,
    limit,
    metadata
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
    metadata: typeof metadata === 'boolean'
      ? (metadata ? { artist: true, album: true } : undefined)
      : metadata
  };

  // Run only the engines that match the active filter — in parallel
  const [songMatches, artistMatches, albumMatches, playlistMatches, genreMatches] =
    await Promise.all([
      filter === 'All' || filter === 'Songs'
        ? SongSearchEngine.search(query, engineOptions)
        : EMPTY_MATCHES,
      filter === 'All' || filter === 'Artists'
        ? ArtistSearchEngine.search(query, engineOptions)
        : EMPTY_MATCHES,
      filter === 'All' || filter === 'Albums'
        ? AlbumSearchEngine.search(query, engineOptions)
        : EMPTY_MATCHES,
      filter === 'All' || filter === 'Playlists'
        ? PlaylistSearchEngine.search(query, engineOptions)
        : EMPTY_MATCHES,
      filter === 'All' || filter === 'Genres'
        ? GenreSearchEngine.search(query, engineOptions)
        : EMPTY_MATCHES
    ]);

  timeEnd(timer, 'Total Search');

  // Unwrap SearchMatch<T>[] → T[] for the result contract
  const songs = songMatches.map((m) => m.item);
  const artists = artistMatches.map((m) => m.item);
  const albums = albumMatches.map((m) => m.item);
  const playlists = playlistMatches.map((m) => m.item);
  const genres = genreMatches.map((m) => m.item);

  // Compute section confidence — coordinator's responsibility, not the engines'
  const bestTierOf = (matches: SearchMatch<unknown>[]): MatchTierValue =>
    matches.length > 0 ? matches[0].tier : MATCH_TIER.NONE;

  const confidence = {
    songs: bestTierOf(songMatches),
    artists: bestTierOf(artistMatches),
    albums: bestTierOf(albumMatches),
    playlists: bestTierOf(playlistMatches),
    genres: bestTierOf(genreMatches)
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

  // Recent search history (debounced — same logic as before)
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
    availableResults: [], // @deprecated — no longer needed with improved matching
    confidence
  };
};

export const SearchCoordinator = { query };
