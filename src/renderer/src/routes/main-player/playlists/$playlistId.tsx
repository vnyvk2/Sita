import { SpecialPlaylists } from '@common/playlists.enum';
import { CollectionClient } from '@renderer/api/CollectionClient';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songFilterOptions, songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { queryClient } from '@renderer/index';
import { collectionDetailOptions, collectionEntriesOptions } from '@renderer/hooks/collections/useCollectionQueries';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { lazy, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PageSearchInput from '@renderer/components/PageSearchInput';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import Button from '@renderer/components/Button';

const SensitiveActionConfirmPrompt = lazy(
  () => import('@renderer/components/SensitiveActionConfirmPrompt')
);
const AddSongsToTargetPlaylistPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/AddSongsToTargetPlaylistPrompt')
);

export const Route = createFileRoute('/main-player/playlists/$playlistId')({
  validateSearch: songSearchSchema,
  component: PlaylistInfoPage,
  loader: async ({ params }) => {
    await queryClient.ensureQueryData(
      collectionDetailOptions(Number(params.playlistId))
    );
  }
});

function PlaylistInfoPage() {
  const { playlistId } = Route.useParams({
    select: (params) => ({ playlistId: Number(params.playlistId) })
  });

  const queue = useStore(store, (state) => state.localStorage.queue);
  const playlistSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates?.playlistDetailPage || 'addedOrder'
  );
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateQueueData, changePromptMenuData, addNewNotifications, createQueue } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const { sortingOrder = playlistSortingState, filteringOrder = 'notSelected', keyword, scrollTopOffset } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/$playlistId' });

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistDetailPage', sortingOrder);
  }, [sortingOrder]);

  const { data: playlistData } = useSuspenseQuery(
    collectionDetailOptions(playlistId)
  );

  const { data: collectionEntries = [] } = useQuery({
    ...collectionEntriesOptions(playlistId, 0, 99999),
    enabled: !!playlistId
  });

  const { data: rawPlaylistSongs = [] } = useQuery({
    ...songQuery.allSongInfo({
      songIds: collectionEntries.map((e) => e.songId),
      sortType: sortingOrder,
      filterType: filteringOrder
    }),
    enabled: collectionEntries.length > 0
  });

  const playlistSongs = useMemo(() => {
    if (sortingOrder === 'addedOrder' || !sortingOrder) {
      const songMap = new Map(rawPlaylistSongs.map((s) => [s.songId, s]));
      const positionOrderedSongs: typeof rawPlaylistSongs = [];
      for (const entry of collectionEntries) {
        const song = songMap.get(entry.songId);
        if (song) positionOrderedSongs.push(song);
      }
      return positionOrderedSongs;
    }
    return rawPlaylistSongs;
  }, [collectionEntries, rawPlaylistSongs, sortingOrder]);

  const search = usePageSearch({
    keyword,
    updateSearch: (val) =>
      navigate({
        search: (prev) => ({ ...prev, keyword: val || undefined }),
        replace: true
      })
  });

  const filteredSongs = useMemo(() => {
    const q = keyword?.trim();
    if (!q) return playlistSongs;
    const lowerQ = q.toLowerCase();

    return playlistSongs.filter((song) => {
      const titleMatch = song.title?.toLowerCase().includes(lowerQ);
      const artistsStr = song.artists?.map((a) => a.name).join(' ').toLowerCase() ?? '';
      const artistMatch = artistsStr.includes(lowerQ);
      const albumMatch = song.album?.title?.toLowerCase().includes(lowerQ);
      const genresStr = song.genres?.map((g) => g.name).join(' ').toLowerCase() ?? '';
      const genreMatch = genresStr.includes(lowerQ);
      return titleMatch || artistMatch || albumMatch || genreMatch;
    });
  }, [playlistSongs, keyword]);

  const selectAllHandler = useSelectAllHandler(filteredSongs, 'songs', 'songId');

  const openAddSongsPrompt = useCallback(() => {
    changePromptMenuData(
      true,
      <AddSongsToTargetPlaylistPrompt
        playlistId={playlistData.id}
        playlistName={playlistData.name}
        existingSongIds={playlistSongs.map((s) => s.songId)}
      />
    );
  }, [changePromptMenuData, playlistData.id, playlistData.name, playlistSongs]);

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = filteredSongs
        .filter((song) => !song.isBlacklisted)
        .map((song) => song.songId);
      createQueue(
        queueSongIds,
        'playlist',
        false,
        playlistData.id,
        false,
        playlistData.name
      );
      updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, playlistData.id, playlistData.name, filteredSongs]
  );

  const clearSongHistory = useCallback(() => {
    changePromptMenuData(
      true,
      <SensitiveActionConfirmPrompt
        title={t('settingsPage.confirmSongHistoryDeletion')}
        content={t('settingsPage.songHistoryDeletionDisclaimer')}
        confirmButton={{
          label: t('settingsPage.clearHistory'),
          clickHandler: () =>
            window.api.audioLibraryControls
              .clearSongHistory()
              .then(
                (res) =>
                  res.success &&
                  addNewNotifications([
                    {
                      id: 'queueCleared',
                      duration: 5000,
                      content: t('settingsPage.songHistoryDeletionSuccess')
                    }
                  ])
              )
              .catch((err) => console.error(err))
        }}
      />
    );
  }, [addNewNotifications, changePromptMenuData, t]);

  const addSongsToQueue = useCallback(() => {
    const validSongIds = filteredSongs
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
    filteredSongs,
    queue.queues[queue.currentQueueIndex].songIds,
    t,
    updateQueueData
  ]);

  const shuffleAndPlaySongs = useCallback(
    () =>
      createQueue(
        filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'playlist',
        true,
        playlistData.id,
        true
      ),
    [createQueue, playlistData.id, filteredSongs]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'songs',
        false,
        playlistData.id,
        true
      ),
    [createQueue, playlistData.id, filteredSongs]
  );

  const searchBar = (
    <PageSearchInput
      inputRef={search.inputRef}
      value={search.value}
      onChange={search.onChange}
      onCompositionStart={search.onCompositionStart}
      onCompositionEnd={search.onCompositionEnd}
      placeholder={t('searchPage.searchPlaceholderSongs', 'Search songs...')}
    />
  );

  return (
    <MainContainer
      className="main-container playlist-info-page-container h-full! px-8 pr-0! pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'f') {
          e.preventDefault();
          e.stopPropagation();
          search.inputRef.current?.focus();
        } else if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      <TitleContainer
        title={playlistData.name}
        className="pr-4"
        otherItems={[searchBar]}
        buttons={[
          {
            label: t('settingsPage.clearHistory'),
            iconName: 'clear',
            clickHandler: clearSongHistory,
            isVisible: playlistData.playlistId === SpecialPlaylists.History,
            isDisabled: !(playlistData.itemCount > 0)
          },
          {
            tooltipLabel: t('playlist.addSongs', 'Add songs'),
            iconName: 'playlist_add',
            clickHandler: openAddSongsPrompt,
            isVisible:
              playlistData.playlistId !== SpecialPlaylists.History &&
              playlistData.playlistId !== SpecialPlaylists.Favorites
          },
          {
            tooltipLabel: t('common.playAll'),
            iconName: 'play_arrow',
            clickHandler: playAllSongs,
            isDisabled: !(playlistData.itemCount > 0)
          },
          {
            tooltipLabel: t('common.shuffleAndPlay'),
            iconName: 'shuffle',
            clickHandler: shuffleAndPlaySongs,
            isDisabled: !(playlistData.itemCount > 0)
          },
          {
            tooltipLabel: t('common.addToQueue'),
            iconName: 'add',
            clickHandler: addSongsToQueue,
            isDisabled: !(playlistData.itemCount > 0)
          }
        ]}
        dropdowns={[
          {
            name: 'songsPageFilterDropdown',
            type: `${t('common.filterBy')} :`,
            value: filteringOrder,
            options: songFilterOptions,
            onChange: (e) => {
              const order = e.currentTarget.value as SongFilterTypes;
              navigate({ search: (prev) => ({ ...prev, filteringOrder: order }) });
            }
          },
          {
            name: 'PlaylistPageSortDropdown',
            type: `${t('common.sortBy')} :`,
            value: sortingOrder,
            options: songSortOptions,
            onChange: (e) => {
              const order = e.currentTarget.value as SongSortTypes;
              navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) });
            },
            isDisabled: !(playlistData.itemCount > 0)
          }
        ]}
      />
      {filteredSongs.length > 0 && (
        <VirtualizedList
          data={filteredSongs}
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
                playlist={playlistData}
                songs={playlistSongs}
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
                additionalContextMenuItems={[
                  {
                    label: t('playlistsPage.removeFromThisPlaylist'),
                    iconName: 'playlist_remove',
                    handlerFunction: () =>
                      CollectionClient
                        .removeSongs({ playlistId: playlistData.playlistId, songIds: [item.songId] })
                        .then(() =>
                            addNewNotifications([
                              {
                                id: `${item.songId}Removed`,
                                duration: 5000,
                                content: t('playlistsPage.removeSongFromPlaylistSuccess', {
                                  title: item.title,
                                  playlistName: playlistData.name
                                })
                              }
                            ])
                        )
                        .catch((err) => console.error(err))
                  }
                ]}
              />
            );
          }}
        />
      )}
      {playlistSongs.length > 0 && filteredSongs.length === 0 && (
        <div className="flex h-full grow flex-col">
          <PlaylistInfoAndImgContainer
            playlist={playlistData}
            songs={playlistSongs}
            filteredSongs={filteredSongs}
          />
          <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80! py-12">
            <span className="material-icons-round-outlined mb-4 text-5xl">search_off</span>
            <span className="mb-2 font-medium text-xl">{t('searchPage.noResultsTitle', 'No matching songs found')}</span>
            <span className="text-sm opacity-75">{t('searchPage.noResultsDesc', { keyword, defaultValue: `No songs match "${keyword}" in this playlist.` })}</span>
          </div>
        </div>
      )}
      {playlistSongs.length === 0 && (
        <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center text-center text-lg font-light opacity-80!">
          <span className="material-icons-round-outlined mb-4 text-5xl">brightness_empty</span>
          <span className="mb-6">{t('playlist.empty')}</span>
          {!SpecialPlaylists.isSpecialPlaylistId(playlistData.playlistId) && (
            <Button
              label={t('playlist.addSongs', 'Add songs')}
              iconName="playlist_add"
              className="bg-background-color-3! text-font-color-black! dark:bg-dark-background-color-3! dark:text-font-color-black! cursor-pointer rounded-xl px-6 py-3 text-lg font-medium shadow-md"
              clickHandler={openAddSongsPrompt}
            />
          )}
        </div>
      )}
    </MainContainer>
  );
}
