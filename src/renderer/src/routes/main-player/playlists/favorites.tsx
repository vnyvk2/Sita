import { type DropdownOption } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { getQueuesManager } from '@renderer/other/queuesManager';
import {
  getSongListIdentity,
  songCacheKeys,
  songIdsVersionFromState,
  songQuery,
  type SongIdsParams
} from '@renderer/queries/songs';
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
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    language: search.language
  }),
  loader: async ({ deps }) => {
    if (typeof window === 'undefined' || !window.api?.audioLibraryControls) return;
    const sortingState = storage.sortingStates.getSortingStates('favoritesPage');
    const idsParams: SongIdsParams = {
      sortType: deps?.sortingOrder ?? sortingState ?? 'addedOrder',
      filterType: 'favorites',
      language: deps?.language && deps.language !== 'all' ? deps.language : undefined
    };
    const idsData = await queryClient.fetchQuery(songQuery.ids(idsParams));
    const state = queryClient.getQueryState(songQuery.ids(idsParams).queryKey);
    const version = songIdsVersionFromState(state?.dataUpdatedAt);
    const listIdentity = getSongListIdentity(idsParams);
    await queryClient.ensureQueryData({
      queryKey: songCacheKeys.window(listIdentity, version, 0),
      queryFn: () =>
        window.api.audioLibraryControls.getSongInfo(
          idsData.ids.slice(0, Math.min(200, idsData.ids.length)),
          undefined,
          undefined,
          undefined,
          true
        ),
      staleTime: 5 * 60 * 1000
    });
  },
  component: FavoritesPlaylistInfoPage
});

const playlistData: Playlist = {
  playlistId: SpecialPlaylists.Favorites,
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
 * management, import, and sorting using ID-first windowed hydration.
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

  const songIdsParams: SongIdsParams = useMemo(
    () => ({
      sortType: sortingOrder,
      filterType: 'favorites',
      language: language && language !== 'all' ? language : undefined
    }),
    [sortingOrder, language]
  );

  const idsQuery = useSuspenseQuery(songQuery.ids(songIdsParams));
  const filteredSongIds = idsQuery.data.ids;
  const idsVersion = songIdsVersionFromState(idsQuery.dataUpdatedAt);
  const listIdentity = useMemo(() => getSongListIdentity(songIdsParams), [songIdsParams]);
  const blacklistedSet = useMemo(
    () => new Set(idsQuery.data.blacklistedIds),
    [idsQuery.data.blacklistedIds]
  );

  const playableSongIds = useMemo(
    () => filteredSongIds.filter((id) => !blacklistedSet.has(id)),
    [filteredSongIds, blacklistedSet]
  );

  const { getItem, onRangeChange } = useWindowHydration(filteredSongIds, idsVersion, {
    enabled: filteredSongIds.length > 0,
    listIdentity,
    isCompactView: preferences.isCompactSongView,
    rowHeight: 60
  });

  const {
    data: { languages: availableLanguages }
  } = useSuspenseQuery(songQuery.facets());

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

  const selectAllHandler = useSelectAllHandler(playableSongIds, 'songs');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      createQueue(playableSongIds, 'favorites', false, '', false, t('common.favorites', 'Favorites'));
      updateQueueData(playableSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, t, playableSongIds]
  );

  const addSongsToQueue = useCallback(() => {
    getQueuesManager().getActiveQueue().addSongIdsToEnd(playableSongIds);
    addNewNotifications([
      {
        id: `addedToQueue`,
        duration: 5000,
        content: t('notifications.addedToQueue', {
          count: playableSongIds.length
        })
      }
    ]);
  }, [addNewNotifications, playableSongIds, t]);

  const shuffleAndPlaySongs = useCallback(
    () =>
      createQueue(
        playableSongIds,
        'favorites',
        true,
        '',
        true,
        t('common.favorites', 'Favorites')
      ),
    [createQueue, playableSongIds, t]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        playableSongIds,
        'favorites',
        false,
        '',
        true,
        t('common.favorites', 'Favorites')
      ),
    [createQueue, playableSongIds, t]
  );

  const importSongsToFavorites = useCallback(() => {
    window.api.collections
      .import({ targetPlaylistId: SpecialPlaylists.Favorites })
      .then(() => {
        queryClient.invalidateQueries({ queryKey: songQuery.ids._def });
      })
      .catch((err) => console.error(err));
  }, []);

  const renderSong = useCallback(
    (index: number) => {
      const song = getItem(index);
      if (song) {
        return (
          <Song
            key={song.songId}
            index={index}
            isIndexingSongs={preferences.isSongIndexingEnabled}
            onPlayClick={handleSongPlayBtnClick}
            selectAllHandler={selectAllHandler}
            isCompact={preferences.isCompactSongView}
            isDelegated={true}
            {...song}
            trackNo={undefined}
          />
        );
      }
      return (
        <SongRowSkeleton
          index={index}
          isCompact={preferences.isCompactSongView}
          rowSize={preferences.isCompactSongView ? 'small' : 'normal'}
        />
      );
    },
    [
      getItem,
      handleSongPlayBtnClick,
      preferences.isCompactSongView,
      preferences.isSongIndexingEnabled,
      selectAllHandler
    ]
  );

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
            isDisabled: !(filteredSongIds.length > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: shuffleAndPlaySongs,
            isDisabled: !(filteredSongIds.length > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: addSongsToQueue,
            isDisabled: !(filteredSongIds.length > 0)
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
            isDisabled: !(filteredSongIds.length > 0)
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
            isDisabled: !(filteredSongIds.length > 0)
          }
        ]}
      />
      <VirtualizedList
        data={filteredSongIds}
        fixedItemHeight={60}
        scrollKey={scrollKey}
        computeItemKey={(_index, id) => id}
        onChange={onRangeChange}
        components={{
          Header: () => (
            <PlaylistInfoAndImgContainer
              playlist={mapLegacyPlaylistToDto({
                ...playlistData,
                songs: filteredSongIds
              })}
              songs={[]}
            />
          )
        }}
        itemContent={renderSong}
      />
      {filteredSongIds.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          {t('playlist.empty')}
        </div>
      )}
    </MainContainer>
  );
}

export default FavoritesPlaylistInfoPage;
