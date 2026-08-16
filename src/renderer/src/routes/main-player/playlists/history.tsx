import { SpecialPlaylists } from '@common/playlists.enum';
import type { DropdownProp } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import NewPlaylistPrompt from '@renderer/components/PlaylistsPage/NewPlaylistPrompt';
import Song from '@renderer/components/SongsPage/Song';
import { songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { songQuery } from '@renderer/queries/songs';
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
 * period filtering, Most Played limits, and playlist creation.
 *
 * @returns A React element representing the History playlist information page.
 */
function HistoryPlaylistInfoPage() {
  const { period: searchPeriod, mostPlayedLimit: searchLimit } = Route.useSearch();

  const queue = useStore(store, (state) => state.localStorage.queue);
  const playlistSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.playlistDetailPage || 'addedOrder'
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
  const { sortingOrder = playlistSortingState } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/history' });

  const period = (searchPeriod as HistoryPeriod) || storedPeriod;
  const mostPlayedLimit = searchLimit || storedLimit;

  const scrollKey = useMemo(
    () => `history-playlist:${sortingOrder}:${period}:${mostPlayedLimit}`,
    [sortingOrder, period, mostPlayedLimit]
  );

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistDetailPage', sortingOrder);
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

  const { data: historySongs = [] } = useSuspenseQuery({
    ...songQuery.history({ sortType: sortingOrder, period, limit: mostPlayedLimit }),
    select: (data) => data.data
  });

  const selectAllHandler = useSelectAllHandler(historySongs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = historySongs
        .filter((song) => !song.isBlacklisted)
        .map((song) => song.songId);
      createQueue(
        queueSongIds,
        'playlist',
        false,
        'history',
        false,
        t('common.history', 'History')
      );
      updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, t, historySongs]
  );

  const addSongsToQueue = useCallback(() => {
    const validSongIds = historySongs
      .filter((song) => !song.isBlacklisted)
      .map((song) => song.songId);
    updateQueueData(undefined, [...queue.queues[queue.currentQueueIndex].songIds, ...validSongIds]);
    addNewNotifications([
      {
        id: `addedToQueue`,
        duration: 5000,
        content: t('notifications.addedToQueue', {
          count: validSongIds.length
        })
      }
    ]);
  }, [
    addNewNotifications,
    historySongs,
    queue.queues[queue.currentQueueIndex].songIds,
    t,
    updateQueueData
  ]);

  const shuffleAndPlaySongs = useCallback(
    () =>
      createQueue(
        historySongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'playlist',
        true,
        'history',
        true
      ),
    [createQueue, historySongs]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        historySongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'songs',
        false,
        'history',
        true
      ),
    [createQueue, historySongs]
  );

  const createPlaylistFromHistory = useCallback(() => {
    if (historySongs.length === 0) return;
    const songIds = historySongs.map((song) => song.songId);
    changePromptMenuData(true, <NewPlaylistPrompt songIds={songIds} />);
  }, [changePromptMenuData, historySongs]);

  const isMostPlayedMode =
    sortingOrder === 'allTimeMostListened' || sortingOrder === 'monthlyMostListened';

  const dropdowns = useMemo(() => {
    const list: DropdownProp<string>[] = [
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
          storage.sortingStates.setSortingStates('playlistDetailPage', order);
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
  }, [isMostPlayedMode, mostPlayedLimit, navigate, period, sortingOrder, t]);

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
            isDisabled: !(historySongs.length > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: shuffleAndPlaySongs,
            isDisabled: !(historySongs.length > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: addSongsToQueue,
            isDisabled: !(historySongs.length > 0)
          },
          {
            tooltipLabel: t(
              'historyPage.createPlaylistFromHistory',
              'Create Playlist from History'
            ),
            iconName: 'playlist_add',
            clickHandler: createPlaylistFromHistory,
            isDisabled: !(historySongs.length > 0)
          }
        ]}
        dropdowns={dropdowns}
      />
      <VirtualizedList
        data={historySongs}
        fixedItemHeight={60}
        scrollKey={scrollKey}
        components={{
          Header: () => (
            <PlaylistInfoAndImgContainer
              playlist={mapLegacyPlaylistToDto(playlistData)}
              songs={historySongs}
            />
          )
        }}
        itemContent={(index, item) => {
          return (
            <Song
              key={index}
              index={index}
              isIndexingSongs={preferences.isSongIndexingEnabled}
              onPlayClick={handleSongPlayBtnClick}
              selectAllHandler={selectAllHandler}
              {...item}
              trackNo={undefined}
            />
          );
        }}
      />
      {historySongs.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          {t('playlist.empty')}
        </div>
      )}
    </MainContainer>
  );
}
