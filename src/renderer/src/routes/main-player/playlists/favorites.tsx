import { type DropdownOption } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { songQuery } from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { mapLegacyPlaylistToDto } from '@renderer/utils/playlistAdapter';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { SpecialPlaylists } from '../../../../../common/playlists.enum';
import favoritesPlaylistCoverImage from '../../../assets/images/webp/favorites-playlist-icon.webp';

export const Route = createFileRoute('/main-player/playlists/favorites')({
  validateSearch: songSearchSchema,
  component: FavoritesPlaylistInfoPage
});

const playlistData: Playlist = {
  playlistId: SpecialPlaylists.Favorites, // Special ID for Favorites playlist
  name: 'Favorites',
  artworkPaths: {
    artworkPath: favoritesPlaylistCoverImage,
    optimizedArtworkPath: favoritesPlaylistCoverImage,
    isDefaultArtwork: true
  },
  songs: [],
  createdDate: new Date(),
  isArtworkAvailable: true
};

/**
 * Renders the Favorites playlist information and song list UI with controls for playback, queue
 * management, import, and sorting.
 *
 * The component loads the current Favorites songs (respecting the selected sort order), persists
 * the sort order to local storage, and provides actions to play a single song, play all, shuffle
 * and play, add songs to the queue, and import favorites. It also supports Ctrl+A to select all
 * songs and disables controls when there are no favorite songs.
 *
 * @returns The React element representing the Favorites playlist info page.
 */
function FavoritesPlaylistInfoPage() {
  const favoritesSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.favoritesPage || 'addedOrder'
  );
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateQueueData, addNewNotifications, createQueue } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { sortingOrder = favoritesSortingState, language = 'all' } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/favorites' });

  const scrollKey = useMemo(
    () => `favorites-playlist:${sortingOrder}:${language || 'all'}`,
    [sortingOrder, language]
  );

  useEffect(() => {
    storage.sortingStates.setSortingStates('favoritesPage', sortingOrder);
  }, [sortingOrder]);

  const { data: favoriteSongs = [] } = useSuspenseQuery({
    ...songQuery.favorites({ sortType: sortingOrder }),
    select: (data) => data.data
  });

  const availableLanguages = useMemo(() => {
    if (!favoriteSongs || favoriteSongs.length === 0) return [];
    const langs = new Set<string>();
    for (const song of favoriteSongs) {
      if (song.language && song.language.trim() !== '') {
        langs.add(song.language.trim());
      }
    }
    return Array.from(langs).sort();
  }, [favoriteSongs]);

  const languageDropdownOptions: DropdownOption<string>[] = useMemo(() => {
    const options: DropdownOption<string>[] = [
      { label: t('common.allLanguages', 'All Languages'), value: 'all' },
      { label: t('common.unspecifiedLanguage', 'Unspecified'), value: 'unspecified' }
    ];
    if (availableLanguages.length > 0) {
      options.push({ label: '', value: 'divider', isDivider: true });
      for (const lang of availableLanguages) {
        options.push({ label: lang, value: lang });
      }
    }
    return options;
  }, [availableLanguages, t]);

  const filteredSongs = useMemo(() => {
    if (!language || language === 'all') return favoriteSongs;
    return favoriteSongs.filter((song) => {
      if (language === 'unspecified') {
        return !song.language || song.language.trim() === '';
      }
      return song.language?.toLowerCase() === language.toLowerCase();
    });
  }, [favoriteSongs, language]);

  const selectAllHandler = useSelectAllHandler(filteredSongs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = filteredSongs
        .filter((song) => !song.isBlacklisted)
        .map((song) => song.songId);
      createQueue(queueSongIds, 'favorites', false, '', false, t('common.favorites', 'Favorites'));
      updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, t, filteredSongs]
  );

  const addSongsToQueue = useCallback(() => {
    const validSongIds = filteredSongs
      .filter((song) => !song.isBlacklisted)
      .map((song) => song.songId);
    getQueuesManager().getActiveQueue().addSongIdsToEnd(validSongIds);
    addNewNotifications([
      {
        id: `addedToQueue`,
        duration: 5000,
        content: t('notifications.addedToQueue', {
          count: validSongIds.length
        })
      }
    ]);
  }, [addNewNotifications, filteredSongs, t]);

  const shuffleAndPlaySongs = useCallback(
    () =>
      createQueue(
        filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'favorites',
        true,
        '',
        true
      ),
    [createQueue, filteredSongs]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'favorites',
        false,
        '',
        true
      ),
    [createQueue, filteredSongs]
  );

  const importSongsToFavorites = useCallback(() => {
    window.api.collections
      .import({ targetPlaylistId: SpecialPlaylists.Favorites })
      .then(() => {
        queryClient.invalidateQueries({
          queryKey: songQuery.favorites({ sortType: sortingOrder }).queryKey
        });
      })
      .catch((err) => console.error(err));
  }, [sortingOrder]);

  return (
    <MainContainer
      className="main-container playlist-info-page-container h-full! px-8 pr-0! pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      <TitleContainer
        title={t('playlistsPage.favorites')}
        className="pr-4"
        buttons={[
          {
            label: t('playlist.importSongs'),
            iconName: 'download',
            clickHandler: importSongsToFavorites
          },
          {
            tooltipLabel: t('common.playAll'),
            iconName: 'play_arrow',
            clickHandler: playAllSongs,
            isDisabled: !(favoriteSongs.length > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: shuffleAndPlaySongs,
            isDisabled: !(favoriteSongs.length > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: addSongsToQueue,
            isDisabled: !(favoriteSongs.length > 0)
          }
        ]}
        dropdowns={[
          {
            name: 'favoritesLanguageDropdown',
            type: `${t('common.language', 'Language')} :`,
            value: language,
            options: languageDropdownOptions,
            onChange: (e) => {
              const val = e.currentTarget.value;
              navigate({
                search: (prev) => ({
                  ...prev,
                  language: val === 'all' ? undefined : val
                }),
                replace: true
              });
            },
            isDisabled: !(favoriteSongs.length > 0)
          },
          {
            name: 'PlaylistPageSortDropdown',
            type: `${t('common.sortBy')} :`,
            value: sortingOrder,
            options: songSortOptions,
            onChange: (e) => {
              const order = e.currentTarget.value as SongSortTypes;
              navigate({ search: (prev) => ({ ...prev, sortingOrder: order }), replace: true });
            },
            isDisabled: !(favoriteSongs.length > 0)
          }
        ]}
      />
      <VirtualizedList
        data={filteredSongs}
        fixedItemHeight={60}
        scrollKey={scrollKey}
        components={{
          Header: () => (
            <PlaylistInfoAndImgContainer
              playlist={mapLegacyPlaylistToDto({
                ...playlistData,
                songs: favoriteSongs
              })}
              songs={favoriteSongs}
              filteredSongs={filteredSongs}
            />
          )
        }}
        itemContent={(index, item) => {
          return (
            <Song
              key={index}
              index={index - 1}
              isIndexingSongs={preferences.isSongIndexingEnabled}
              onPlayClick={handleSongPlayBtnClick}
              selectAllHandler={selectAllHandler}
              {...item}
              trackNo={undefined}
            />
          );
        }}
      />
      {filteredSongs.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          {t('playlist.empty')}
        </div>
      )}
    </MainContainer>
  );
}
