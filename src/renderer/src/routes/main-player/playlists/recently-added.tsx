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
import { recentlyAddedSongSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { type ChangeEvent, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import playlistCoverDefaultImage from '../../../assets/images/webp/playlist_cover_default.webp';

export const Route = createFileRoute('/main-player/playlists/recently-added')({
  validateSearch: recentlyAddedSongSearchSchema,
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
  const { scrollTopOffset, period: searchPeriod } = Route.useSearch();

  const queue = useStore(store, (state) => state.localStorage.queue);
  const playlistSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.playlistDetailPage || 'addedOrder'
  );
  const storedPeriod = useStore(
    store,
    (state) => state.localStorage.sortingStates?.recentlyAddedPagePeriod || 'today'
  );

  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateQueueData, addNewNotifications, createQueue, changePromptMenuData } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { sortingOrder = playlistSortingState } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/recently-added' });

  const period = (searchPeriod as RecentlyAddedPeriod) || storedPeriod;

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistDetailPage', sortingOrder);
  }, [sortingOrder]);

  const { data: recentlyAddedSongs = [] } = useSuspenseQuery({
    ...songQuery.recentlyAdded({ sortType: sortingOrder, period }),
    select: (data) => data.data
  });

  const selectAllHandler = useSelectAllHandler(recentlyAddedSongs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = recentlyAddedSongs
        .filter((song) => !song.isBlacklisted)
        .map((song) => song.songId);
      createQueue(
        queueSongIds,
        'recentlyAdded',
        false,
        'recentlyAdded',
        false,
        t('common.recentlyAdded', 'Recently Added')
      );
      updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, recentlyAddedSongs, t]
  );

  const addSongsToQueue = useCallback(() => {
    const validSongIds = recentlyAddedSongs
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
    recentlyAddedSongs,
    queue.queues,
    queue.currentQueueIndex,
    t,
    updateQueueData
  ]);

  const shuffleAndPlaySongs = useCallback(
    () =>
      createQueue(
        recentlyAddedSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'recentlyAdded',
        true,
        'recentlyAdded',
        true
      ),
    [createQueue, recentlyAddedSongs]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        recentlyAddedSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'recentlyAdded',
        false,
        'recentlyAdded',
        true
      ),
    [createQueue, recentlyAddedSongs]
  );

  const createPlaylistFromRecentlyAdded = useCallback(() => {
    if (recentlyAddedSongs.length === 0) return;
    const songIds = recentlyAddedSongs.map((song) => song.songId);
    changePromptMenuData(true, <NewPlaylistPrompt songIds={songIds} />);
  }, [changePromptMenuData, recentlyAddedSongs]);

  const dropdowns = useMemo(() => {
    const list: DropdownProp<string>[] = [
      {
        name: 'RecentlyAddedPeriodDropdown',
        type: `${t('playlistsPage.period', 'Period')} :`,
        value: period,
        options: [
          { label: t('playlistsPage.addedToday', 'Added Today'), value: 'today' },
          { label: t('playlistsPage.last24Hours', 'Last 24 Hours'), value: '24h' },
          { label: t('playlistsPage.last7Days', 'Last 7 Days'), value: '7d' },
          { label: t('playlistsPage.last30Days', 'Last 30 Days'), value: '30d' },
          { label: t('playlistsPage.last90Days', 'Last 90 Days'), value: '90d' },
          { label: t('playlistsPage.last365Days', 'Last 365 Days'), value: '365d' },
          { label: t('playlistsPage.allTime', 'All Time'), value: 'all' }
        ],
        onChange: (e: ChangeEvent<HTMLSelectElement>) => {
          const newPeriod = e.currentTarget.value as RecentlyAddedPeriod;
          storage.sortingStates.setSortingStates('recentlyAddedPagePeriod', newPeriod);
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

    return list;
  }, [navigate, period, sortingOrder, t]);

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
            isDisabled: !(recentlyAddedSongs.length > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: shuffleAndPlaySongs,
            isDisabled: !(recentlyAddedSongs.length > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: addSongsToQueue,
            isDisabled: !(recentlyAddedSongs.length > 0)
          },
          {
            tooltipLabel: t('playlist.createPlaylistFromRecentlyAdded', 'Create Playlist'),
            iconName: 'playlist_add',
            clickHandler: createPlaylistFromRecentlyAdded,
            isDisabled: !(recentlyAddedSongs.length > 0)
          }
        ]}
        dropdowns={dropdowns}
      />
      <VirtualizedList
        data={recentlyAddedSongs}
        fixedItemHeight={60}
        scrollTopOffset={scrollTopOffset}
        onDebouncedScroll={(range) => {
          navigate({
            replace: true,
            search: (prev) => ({ ...prev, scrollTopOffset: range.startIndex })
          });
        }}
        components={{
          Header: () => (
            <PlaylistInfoAndImgContainer
              playlist={{
                ...mapLegacyPlaylistToDto(playlistData),
                name: t('common.recentlyAdded', 'Recently Added')
              }}
              songs={recentlyAddedSongs}
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
      {recentlyAddedSongs.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          {t('playlist.empty')}
        </div>
      )}
    </MainContainer>
  );
}
