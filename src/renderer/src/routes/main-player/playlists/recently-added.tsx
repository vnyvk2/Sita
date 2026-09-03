import { SpecialPlaylists } from '@common/playlists.enum';
import type { DropdownOption, DropdownProp } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import NewPlaylistPrompt from '@renderer/components/PlaylistsPage/NewPlaylistPrompt';
import Song from '@renderer/components/SongsPage/Song';
import { songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { getQueuesManager } from '@renderer/other/queuesManager';
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

  const { data: recentlyAddedSongs = [] } = useSuspenseQuery({
    ...songQuery.recentlyAdded({ sortType: sortingOrder, period }),
    select: (data) => data.data
  });

  const availableLanguages = useMemo(() => {
    if (!recentlyAddedSongs || recentlyAddedSongs.length === 0) return [];
    const langs = new Set<string>();
    for (const song of recentlyAddedSongs) {
      if (song.language && song.language.trim() !== '') {
        langs.add(song.language.trim());
      }
    }
    return Array.from(langs).sort();
  }, [recentlyAddedSongs]);

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
    if (!language || language === 'all') return recentlyAddedSongs;
    return recentlyAddedSongs.filter((song) => {
      if (language === 'unspecified') {
        return !song.language || song.language.trim() === '';
      }
      return song.language?.toLowerCase() === language.toLowerCase();
    });
  }, [recentlyAddedSongs, language]);

  const selectAllHandler = useSelectAllHandler(filteredSongs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = filteredSongs
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
    [createQueue, updateQueueData, filteredSongs, t]
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
        'recentlyAdded',
        true,
        'recentlyAdded',
        true
      ),
    [createQueue, filteredSongs]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'recentlyAdded',
        false,
        'recentlyAdded',
        true
      ),
    [createQueue, filteredSongs]
  );

  const createPlaylistFromRecentlyAdded = useCallback(() => {
    if (filteredSongs.length === 0) return;
    const songIds = filteredSongs.map((song) => song.songId);
    changePromptMenuData(true, <NewPlaylistPrompt songIds={songIds} />);
  }, [changePromptMenuData, filteredSongs]);

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
        }
      },
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
          storage.sortingStates.setSortingStates('recentlyAddedPage', order);
          navigate({ search: (prev) => ({ ...prev, sortingOrder: order }), replace: true });
        }
      }
    ];

    return list;
  }, [language, languageDropdownOptions, navigate, period, sortingOrder, t]);

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
        data={filteredSongs}
        fixedItemHeight={60}
        scrollKey={scrollKey}
        components={{
          Header: () => (
            <PlaylistInfoAndImgContainer
              playlist={{
                ...mapLegacyPlaylistToDto({
                  ...playlistData,
                  songs: recentlyAddedSongs
                }),
                name: t('common.recentlyAdded', 'Recently Added')
              }}
              songs={recentlyAddedSongs}
              filteredSongs={filteredSongs}
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
      {filteredSongs.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          {t('playlist.empty')}
        </div>
      )}
    </MainContainer>
  );
}
