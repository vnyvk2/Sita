import { SpecialPlaylists } from '@common/playlists.enum';
import type { DropdownOption, DropdownProp } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import NewPlaylistPrompt from '@renderer/components/PlaylistsPage/NewPlaylistPrompt';
import Song from '@renderer/components/SongsPage/Song';
import { songSortOptions, type SongSortTypes } from '@renderer/components/SongsPage/SongOptions';
import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { getQueuesManager } from '@renderer/other/queuesManager';
import {
  hashSongIds,
  songCacheKeys,
  songIdsVersionFromState,
  songQuery,
  type HistorySongIdsParams
} from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { mapLegacyPlaylistToDto } from '@renderer/utils/playlistAdapter';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { type ChangeEvent, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import historyPlaylistCoverImage from '../../../assets/images/webp/history-playlist-icon.webp';

export const Route = createFileRoute('/main-player/playlists/history')({
  validateSearch: songSearchSchema,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    period: search.period,
    mostPlayedLimit: search.mostPlayedLimit,
    language: search.language
  }),
  loader: async ({ deps }) => {
    if (typeof window === 'undefined' || !window.api?.audioLibraryControls) return;
    const sortingState = storage.sortingStates.getSortingStates('historyPage');
    const storedPeriod = storage.sortingStates.getSortingStates('historyPagePeriod');
    const storedLimit = storage.sortingStates.getSortingStates('historyPageMostPlayedLimit');
    const historyParams: HistorySongIdsParams = {
      sortType: deps?.sortingOrder ?? sortingState ?? 'addedOrder',
      period: (deps?.period as HistoryPeriod) ?? storedPeriod ?? 'all',
      limit: deps?.mostPlayedLimit ?? storedLimit ?? 25,
      language: deps?.language && deps.language !== 'all' ? deps.language : undefined
    };
    const historyData = await queryClient.fetchQuery(songQuery.historyIds(historyParams));
    if (historyData.ids.length === 0) return;
    const state = queryClient.getQueryState(songQuery.historyIds(historyParams).queryKey);
    const version = songIdsVersionFromState(state?.dataUpdatedAt);
    const listIdentity = `history:${historyParams.sortType}:${historyParams.period}:${historyParams.limit}:${historyParams.language || 'all'}`;
    const window0Ids = historyData.ids.slice(0, Math.min(200, historyData.ids.length));
    if (window0Ids.length > 0) {
      await queryClient.ensureQueryData({
        queryKey: songCacheKeys.window(listIdentity, version, 0),
        queryFn: () =>
          window.api.audioLibraryControls.getSongInfo(
            window0Ids,
            undefined,
            undefined,
            undefined,
            true
          ),
        staleTime: 5 * 60 * 1000
      });
    }
  },
  component: HistoryPlaylistInfoPage
});

const playlistData: Playlist = {
  playlistId: SpecialPlaylists.History, // Special ID for History playlist
  name: 'History',
  artworkPaths: {
    artworkPath: historyPlaylistCoverImage,
    optimizedArtworkPath: historyPlaylistCoverImage,
    isDefaultArtwork: true
  },
  songs: [],
  createdDate: new Date(),
  isArtworkAvailable: true
};

const periodOptions = [
  { label: 'All Time', value: 'all' },
  { label: 'Last 24 Hours', value: '1' },
  { label: 'Last 7 Days', value: '7' },
  { label: 'Last 30 Days', value: '30' },
  { label: 'Last 90 Days', value: '90' },
  { label: 'Last 365 Days', value: '365' }
];

const mostPlayedLimitOptions = [
  { label: 'Top 10', value: '10' },
  { label: 'Top 25', value: '25' },
  { label: 'Top 50', value: '50' },
  { label: 'Top 100', value: '100' }
];

/**
 * Render the History playlist details page with controls for playback, queue management, selection,
 * period filtering, Most Played limits, and playlist creation using windowed hydration.
 *
 * @returns A React element representing the History playlist information page.
 */
function HistoryPlaylistInfoPage() {
  const {
    period: searchPeriod,
    mostPlayedLimit: searchLimit,
    language = 'all'
  } = Route.useSearch();

  const historySortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.historyPage || 'addedOrder'
  );
  const storedPeriod = useStore(
    store,
    (state) => state.localStorage.sortingStates?.historyPagePeriod || 'all'
  );
  const storedLimit = useStore(
    store,
    (state) => state.localStorage.sortingStates?.historyPageMostPlayedLimit || 25
  );

  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateQueueData, addNewNotifications, createQueue, changePromptMenuData } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { sortingOrder = historySortingState } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/history' });

  const period = (searchPeriod as HistoryPeriod) || storedPeriod;
  const mostPlayedLimit = searchLimit || storedLimit;

  const scrollKey = useMemo(
    () => `history-playlist:${sortingOrder}:${period}:${mostPlayedLimit}:${language || 'all'}`,
    [sortingOrder, period, mostPlayedLimit, language]
  );

  useEffect(() => {
    storage.sortingStates.setSortingStates('historyPage', sortingOrder);
  }, [sortingOrder]);

  useEffect(() => {
    if (searchPeriod) {
      storage.sortingStates.setSortingStates('historyPagePeriod', searchPeriod as HistoryPeriod);
    }
  }, [searchPeriod]);

  useEffect(() => {
    if (searchLimit) {
      storage.sortingStates.setSortingStates('historyPageMostPlayedLimit', searchLimit);
    }
  }, [searchLimit]);

  const historyParams: HistorySongIdsParams = useMemo(
    () => ({
      sortType: sortingOrder,
      period,
      limit: mostPlayedLimit,
      language: language && language !== 'all' ? language : undefined
    }),
    [sortingOrder, period, mostPlayedLimit, language]
  );

  const idsQuery = useSuspenseQuery(songQuery.historyIds(historyParams));
  const historyData = idsQuery.data;
  const songIds = historyData.ids;
  const entries = historyData.entries;
  const idsVersion = songIdsVersionFromState(idsQuery.dataUpdatedAt);
  const orderHash = useMemo(() => hashSongIds(songIds), [songIds]);
  const listIdentity = useMemo(
    () =>
      `history:${historyParams.sortType}:${historyParams.period}:${historyParams.limit}:${historyParams.language || 'all'}:${orderHash}`,
    [historyParams, orderHash]
  );
  const blacklistedSet = useMemo(
    () => new Set(historyData.blacklistedIds),
    [historyData.blacklistedIds]
  );

  const playableSongIds = useMemo(
    () => songIds.filter((id) => !blacklistedSet.has(id)),
    [songIds, blacklistedSet]
  );

  const { getItem, onRangeChange } = useWindowHydration(songIds, idsVersion, {
    enabled: songIds.length > 0,
    listIdentity,
    isCompactView: preferences.isCompactSongView,
    rowHeight: 60
  });

  const availableLanguages = historyData.languages ?? [];

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
        'playlist',
        false,
        'history',
        false,
        t('common.history', 'History')
      );
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
        'playlist',
        true,
        'history',
        true,
        t('common.history', 'History')
      ),
    [createQueue, playableSongIds, t]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        playableSongIds,
        'songs',
        false,
        'history',
        true,
        t('common.history', 'History')
      ),
    [createQueue, playableSongIds, t]
  );

  const createPlaylistFromHistory = useCallback(() => {
    if (playableSongIds.length === 0) return;
    changePromptMenuData(true, <NewPlaylistPrompt songIds={playableSongIds} />);
  }, [changePromptMenuData, playableSongIds]);

  const isMostPlayedMode =
    sortingOrder === 'allTimeMostListened' || sortingOrder === 'monthlyMostListened';

  const dropdowns = useMemo(() => {
    const list: DropdownProp<string>[] = [
      {
        name: 'historyLanguageDropdown',
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
        isDisabled: !(songIds.length > 0)
      },
      {
        name: 'HistoryPeriodDropdown',
        type: `${t('historyPage.period', 'Period')} :`,
        value: period,
        options: periodOptions,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          const newPeriod = e.currentTarget.value as HistoryPeriod;
          storage.sortingStates.setSortingStates('historyPagePeriod', newPeriod);
          navigate({ search: (prev) => ({ ...prev, period: newPeriod }), replace: true });
        }
      },
      {
        name: 'PlaylistPageSortDropdown',
        type: `${t('common.sortBy', 'Sort By')} :`,
        value: sortingOrder,
        options: songSortOptions,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          const order = e.currentTarget.value as SongSortTypes;
          storage.sortingStates.setSortingStates('historyPage', order);
          navigate({ search: (prev) => ({ ...prev, sortingOrder: order }), replace: true });
        }
      }
    ];

    if (isMostPlayedMode) {
      list.push({
        name: 'HistoryMostPlayedLimitDropdown',
        type: `${t('historyPage.limit', 'Top')} :`,
        value: String(mostPlayedLimit),
        options: mostPlayedLimitOptions,
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          const limitVal = parseInt(e.currentTarget.value, 10);
          storage.sortingStates.setSortingStates('historyPageMostPlayedLimit', limitVal);
          navigate({ search: (prev) => ({ ...prev, mostPlayedLimit: limitVal }), replace: true });
        }
      });
    }

    return list;
  }, [
    isMostPlayedMode,
    language,
    languageDropdownOptions,
    mostPlayedLimit,
    navigate,
    period,
    songIds.length,
    sortingOrder,
    t
  ]);

  const renderSong = useCallback(
    (index: number, entry: { songId: number; playedAt?: number; playCount?: number }) => {
      const song = getItem(index);
      if (song) {
        return (
          <Song
            key={`${song.songId}-${entry?.playedAt ?? index}`}
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
        title={t('playlistsPage.history')}
        className="pr-4"
        buttons={[
          {
            tooltipLabel: t('common.playAll'),
            iconName: 'play_arrow',
            clickHandler: playAllSongs,
            isDisabled: !(playableSongIds.length > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: shuffleAndPlaySongs,
            isDisabled: !(playableSongIds.length > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: addSongsToQueue,
            isDisabled: !(playableSongIds.length > 0)
          },
          {
            tooltipLabel: t(
              'historyPage.createPlaylistFromHistory',
              'Create Playlist from History'
            ),
            iconName: 'playlist_add',
            clickHandler: createPlaylistFromHistory,
            isDisabled: !(playableSongIds.length > 0)
          },
          {
            tooltipLabel: t('historyPage.viewInsights', 'View Insights & Stats'),
            iconName: 'auto_graph',
            clickHandler: () => navigate({ to: '/main-player/insights' })
          }
        ]}
        dropdowns={dropdowns}
      />
      <VirtualizedList
        data={entries}
        fixedItemHeight={60}
        scrollKey={scrollKey}
        computeItemKey={(index, item) => `${item.songId}-${item.playedAt ?? index}`}
        onChange={onRangeChange}
        components={{
          Header: () => (
            <PlaylistInfoAndImgContainer
              playlist={mapLegacyPlaylistToDto({
                ...playlistData,
                songs: songIds
              })}
              songs={[]}
              filteredCount={songIds.length}
              totalDuration={historyData.totalDuration}
            />
          )
        }}
        itemContent={renderSong}
      />
      {entries.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          {t('playlist.empty')}
        </div>
      )}
    </MainContainer>
  );
}

export default HistoryPlaylistInfoPage;
