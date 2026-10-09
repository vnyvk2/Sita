import { SpecialPlaylists } from '@common/playlists.enum';
import type { DropdownOption, DropdownProp } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import NewPlaylistPrompt from '@renderer/components/PlaylistsPage/NewPlaylistPrompt';
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
import { recentlyAddedSongSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { type ChangeEvent, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import playlistCoverDefaultImage from '../../../assets/images/webp/playlist_cover_default.webp';

export const Route = createFileRoute('/main-player/playlists/recently-added')({
  validateSearch: recentlyAddedSongSearchSchema,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    period: search.period,
    language: search.language
  }),
  loader: async ({ deps }) => {
    if (typeof window === 'undefined' || !window.api?.audioLibraryControls) return;
    const sortingState = storage.sortingStates.getSortingStates('recentlyAddedPage');
    const storedPeriod = storage.sortingStates.getSortingStates('recentlyAddedPagePeriod');
    const idsParams: SongIdsParams = {
      sortType: deps?.sortingOrder ?? sortingState ?? 'addedOrder',
      recentlyAddedPeriod: (deps?.period as RecentlyAddedPeriod) ?? storedPeriod ?? 'today',
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
  component: RecentlyAddedPlaylistInfoPage
});

const playlistData: Playlist = {
  playlistId: SpecialPlaylists.RecentlyAdded,
  name: 'Recently Added',
  artworkPaths: {
    artworkPath: playlistCoverDefaultImage,
    optimizedArtworkPath: playlistCoverDefaultImage,
    isDefaultArtwork: true
  },
  songs: [],
  createdDate: new Date(),
  isArtworkAvailable: true
};

function RecentlyAddedPlaylistInfoPage() {
  const { period: searchPeriod, language = 'all' } = Route.useSearch();

  const recentlyAddedSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.recentlyAddedPage || 'addedOrder'
  );
  const storedPeriod = useStore(
    store,
    (state) => state.localStorage.sortingStates?.recentlyAddedPagePeriod || 'today'
  );

  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateQueueData, addNewNotifications, createQueue, changePromptMenuData } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { sortingOrder = recentlyAddedSortingState } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/recently-added' });

  const period = (searchPeriod as RecentlyAddedPeriod) || storedPeriod;

  const scrollKey = useMemo(
    () => `recently-added-playlist:${sortingOrder}:${period}:${language || 'all'}`,
    [sortingOrder, period, language]
  );

  useEffect(() => {
    storage.sortingStates.setSortingStates('recentlyAddedPage', sortingOrder);
  }, [sortingOrder]);

  const songIdsParams: SongIdsParams = useMemo(
    () => ({
      sortType: sortingOrder,
      recentlyAddedPeriod: period,
      language: language && language !== 'all' ? language : undefined
    }),
    [sortingOrder, period, language]
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
      createQueue(
        playableSongIds,
        'recentlyAdded',
        false,
        'recentlyAdded',
        false,
        t('common.recentlyAdded', 'Recently Added')
      );
      updateQueueData(playableSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, playableSongIds, t]
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
        'recentlyAdded',
        true,
        'recentlyAdded',
        true,
        t('common.recentlyAdded', 'Recently Added')
      ),
    [createQueue, playableSongIds, t]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        playableSongIds,
        'recentlyAdded',
        false,
        'recentlyAdded',
        true,
        t('common.recentlyAdded', 'Recently Added')
      ),
    [createQueue, playableSongIds, t]
  );

  const createPlaylistFromRecentlyAdded = useCallback(() => {
    if (playableSongIds.length === 0) return;
    changePromptMenuData(true, <NewPlaylistPrompt songIds={playableSongIds} />);
  }, [changePromptMenuData, playableSongIds]);

  const dropdowns = useMemo(() => {
    const list: DropdownProp<string>[] = [
      {
        name: 'recentlyAddedLanguageDropdown',
        type: `${t('common.language', 'Language')} :`,
        value: language,
        options: languageDropdownOptions,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
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
        name: 'RecentlyAddedPeriodDropdown',
        type: `${t('recentlyAddedPage.period', 'Period')} :`,
        value: period,
        options: [
          { label: t('recentlyAddedPage.today', 'Today'), value: 'today' },
          { label: t('recentlyAddedPage.last24Hours', 'Last 24 Hours'), value: '24h' },
          { label: t('recentlyAddedPage.last7Days', 'Last 7 Days'), value: '7d' },
          { label: t('recentlyAddedPage.last30Days', 'Last 30 Days'), value: '30d' },
          { label: t('recentlyAddedPage.last90Days', 'Last 90 Days'), value: '90d' },
          { label: t('recentlyAddedPage.lastYear', 'Last Year'), value: '365d' },
          { label: t('recentlyAddedPage.allTime', 'All Time'), value: 'all' }
        ],
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          const newPeriod = e.currentTarget.value as RecentlyAddedPeriod;
          storage.sortingStates.setSortingStates('recentlyAddedPagePeriod', newPeriod);
          navigate({
            search: (prev) => ({
              ...prev,
              period: newPeriod
            }),
            replace: true
          });
        }
      },
      {
        name: 'PlaylistPageSortDropdown',
        type: `${t('common.sortBy')} :`,
        value: sortingOrder,
        options: songSortOptions,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          const order = e.currentTarget.value as SongSortTypes;
          navigate({ search: (prev) => ({ ...prev, sortingOrder: order }), replace: true });
        },
        isDisabled: !(filteredSongIds.length > 0)
      }
    ];
    return list;
  }, [
    language,
    languageDropdownOptions,
    navigate,
    period,
    filteredSongIds.length,
    sortingOrder,
    t
  ]);

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
        title={t('common.recentlyAdded', 'Recently Added')}
        className="pr-4"
        buttons={[
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
          },
          {
            tooltipLabel: t('playlist.createPlaylistFromRecentlyAdded', 'Create Playlist'),
            iconName: 'playlist_add',
            clickHandler: createPlaylistFromRecentlyAdded,
            isDisabled: !(filteredSongIds.length > 0)
          }
        ]}
        dropdowns={dropdowns}
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
              playlist={{
                ...mapLegacyPlaylistToDto({
                  ...playlistData,
                  songs: filteredSongIds
                }),
                name: t('common.recentlyAdded', 'Recently Added')
              }}
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

export default RecentlyAddedPlaylistInfoPage;
