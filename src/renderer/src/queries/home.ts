import { SpecialPlaylists } from '@common/playlists.enum';
import { createQueryKeys } from '@lukemorales/query-key-factory';

import { CollectionClient } from '../api/CollectionClient';

const HOME_METRICS_FETCH_LIMIT = 35;

export const homeQuery = createQueryKeys('home', {
  recentlyPlayedSongs: {
    queryKey: null,
    queryFn: async (): Promise<SongData[]> => {
      const start = 0;
      const end = 30;
      const sortType: SongSortTypes = 'dateAddedDescending';

      const paginatedResult = await window.api.audioLibraryControls.getAllHistorySongs(sortType, {
        start,
        end
      });
      const data = Array.isArray(paginatedResult.data) ? paginatedResult.data : [];
      return data;
    }
  },
  recentSongArtists: {
    queryKey: null,
    queryFn: async (): Promise<Artist[]> => {
      try {
        const historyEntries = await CollectionClient.getEntries(
          SpecialPlaylists.History as unknown as number,
          0,
          99999
        );

        if (!historyEntries || historyEntries.length === 0) return [];

        const songIds = historyEntries.map((e) => e.songId);

        const songs = await window.api.audioLibraryControls.getSongInfo(
          songIds,
          undefined,
          undefined,
          HOME_METRICS_FETCH_LIMIT,
          true
        );

        if (!Array.isArray(songs) || songs.length === 0) return [];

        const artistIds = [
          ...new Set(
            songs
              .map((song) => (song.artists ? song.artists.map((artist) => artist.artistId) : []))
              .flat()
          )
        ];

        if (artistIds.length === 0) return [];

        const { data: artists } = await window.api.artistsData.getArtistData(
          artistIds,
          undefined,
          undefined,
          0,
          HOME_METRICS_FETCH_LIMIT
        );

        return artists;
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  },
  mostLovedSongs: {
    queryKey: null,
    queryFn: async (): Promise<AudioInfo[]> => {
      try {
        const favoritesEntries = await CollectionClient.getEntries(
          SpecialPlaylists.Favorites as unknown as number,
          0,
          99999
        );

        if (!favoritesEntries || favoritesEntries.length === 0) return [];

        const songIds = favoritesEntries.map((e) => e.songId);

        const songs = await window.api.audioLibraryControls.getSongInfo(
          songIds,
          'allTimeMostListened',
          undefined,
          HOME_METRICS_FETCH_LIMIT,
          true
        );

        return Array.isArray(songs) ? songs : [];
      } catch (error) {
        console.error(error);
        return [];
      }
    }
  }
});
