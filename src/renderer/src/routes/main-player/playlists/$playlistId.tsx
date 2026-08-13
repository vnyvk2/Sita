import { SpecialPlaylists } from '@common/playlists.enum';
import { CollectionClient } from '@renderer/api/CollectionClient';
import { collectionKeys } from '@renderer/api/collectionKeys';
import MainContainer from '@renderer/components/MainContainer';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import Song from '@renderer/components/SongsPage/Song';
import {
  canReorder,
  isPersistentPlaylistOrder,
  playlistSortOptions,
  songFilterOptions,
  type SongSortTypes
} from '@renderer/components/SongsPage/SongOptions';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { queryClient } from '@renderer/queryClient';
import {
  collectionDetailOptions,
  collectionEntriesOptions
} from '@renderer/hooks/collections/useCollectionQueries';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { Suspense, lazy, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import PageSearchInput from '@renderer/components/PageSearchInput';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import Button from '@renderer/components/Button';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';

const SensitiveActionConfirmPrompt = lazy(
  () => import('@renderer/components/SensitiveActionConfirmPrompt')
);
const AddSongsToTargetPlaylistPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/AddSongsToTargetPlaylistPrompt')
);
const PlaylistExportSettingsPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/PlaylistExportSettingsPrompt')
);
const PlaylistImportConflictPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/PlaylistImportConflictPrompt')
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
    (state) => state.localStorage.sortingStates?.playlistDetailPage || 'customOrder'
  );
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { updateQueueData, changePromptMenuData, addNewNotifications, createQueue } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const {
    sortingOrder = playlistSortingState || 'customOrder',
    filteringOrder = 'notSelected',
    keyword,
    scrollTopOffset
  } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/$playlistId' });

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistDetailPage', sortingOrder);
  }, [sortingOrder]);

  const { data: playlistData } = useSuspenseQuery(
    collectionDetailOptions(playlistId)
  );

  if (!playlistData) {
    throw new Error('Playlist not found');
  }

  const { data: collectionEntries = [] } = useQuery({
    ...collectionEntriesOptions(playlistId, undefined, undefined, sortingOrder),
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
    if (isPersistentPlaylistOrder(sortingOrder) || !sortingOrder) {
      const songMap = new Map(rawPlaylistSongs.map((s) => [s.songId, s]));
      const positionOrderedSongs: Array<typeof rawPlaylistSongs[0] & { entryId: number }> = [];
      for (const entry of collectionEntries) {
        const song = songMap.get(entry.songId);
        if (song) {
          positionOrderedSongs.push({
            ...song,
            entryId: entry.id
          });
        }
      }
      return positionOrderedSongs;
    }

    // For temporary computed view sorts (Artist, Album, Year, A-Z):
    // Build an O(1) queue map of songId -> entry.id array to accurately preserve duplicate track occurrences
    const entryQueueMap = new Map<number, number[]>();
    for (const entry of collectionEntries) {
      const q = entryQueueMap.get(entry.songId) || [];
      q.push(entry.id);
      entryQueueMap.set(entry.songId, q);
    }

    return rawPlaylistSongs.map((song) => {
      const q = entryQueueMap.get(song.songId);
      const entryId = q && q.length > 0 ? q.shift()! : 0;
      return {
        ...song,
        entryId
      };
    });
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
      const albumMatch = song.album?.name?.toLowerCase().includes(lowerQ);
      const genresStr = song.genres?.map((g) => g.name).join(' ').toLowerCase() ?? '';
      const genreMatch = genresStr.includes(lowerQ);
      return titleMatch || artistMatch || albumMatch || genreMatch;
    });
  }, [playlistSongs, keyword]);

  useEffect(() => {
    console.log('[Pipeline Stage 3: collectionEntries]', collectionEntries.map((e) => ({ id: e.id, songId: e.songId, pos: e.position })));
  }, [collectionEntries]);

  useEffect(() => {
    console.log('[Pipeline Stage 4: rawPlaylistSongs]', rawPlaylistSongs.map((s) => s.songId));
  }, [rawPlaylistSongs]);

  useEffect(() => {
    console.log('[Pipeline Stage 5: playlistSongs]', playlistSongs.map((s) => ({ entryId: s.entryId, songId: s.songId, title: s.title })));
  }, [playlistSongs]);

  useEffect(() => {
    console.log('[Pipeline Stage 6: filteredSongs]', filteredSongs.map((s) => ({ entryId: s.entryId, songId: s.songId, title: s.title })));
  }, [filteredSongs]);

  const selectAllHandler = useSelectAllHandler(filteredSongs, 'songs', 'songId');

  const handleReorder = useCallback(
    async (entryId: number, targetPosition: number, sourceIndex?: number) => {
      if (!canReorder(sortingOrder) || !entryId) return;

      const entriesQuery = collectionEntriesOptions(playlistId, undefined, undefined, sortingOrder);
      const previousEntries = queryClient.getQueryData(entriesQuery.queryKey);

      if (sourceIndex !== undefined && previousEntries && Array.isArray(previousEntries)) {
        queryClient.setQueryData(entriesQuery.queryKey, (oldEntries) => {
          if (!oldEntries) return oldEntries;
          const next = [...oldEntries];
          const [moved] = next.splice(sourceIndex, 1);
          next.splice(targetPosition, 0, moved);
          return next;
        });
      }

      try {
        await CollectionClient.reorderSongs({
          playlistId,
          entryId,
          newPosition: targetPosition
        });
      } catch (err) {
        console.error('Failed to reorder playlist track:', err);
        if (previousEntries) {
          queryClient.setQueryData(entriesQuery.queryKey, previousEntries);
        }
      } finally {
        queryClient.invalidateQueries({ queryKey: collectionKeys.entries(playlistId) });
      }
    },
    [playlistId, sortingOrder]
  );

  const moveSongAbsolute = useCallback(
    (entryId: number, targetIndex: number, sourceIndex?: number) => {
      handleReorder(entryId, targetIndex, sourceIndex);
    },
    [handleReorder]
  );

  const moveSongRelative = useCallback(
    (entryId: number, currentIndex: number, delta: number) => {
      const newPos = Math.max(0, Math.min(filteredSongs.length - 1, currentIndex + delta));
      if (newPos !== currentIndex) {
        handleReorder(entryId, newPos, currentIndex);
      }
    },
    [filteredSongs.length, handleReorder]
  );

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination || !canReorder(sortingOrder)) return;
      const sourceIndex = result.source.index;
      const destIndex = result.destination.index;
      if (sourceIndex === destIndex) return;

      const draggedSong = filteredSongs[sourceIndex];
      console.log('[Pipeline Stage 1: handleDragEnd]', { sourceIndex, destIndex, draggedEntryId: draggedSong?.entryId });
      if (draggedSong?.entryId) {
        moveSongAbsolute(draggedSong.entryId, destIndex, sourceIndex);
      }
    },
    [filteredSongs, moveSongAbsolute, sortingOrder]
  );

  const getContextMenuItems = useCallback(
    (item: (typeof filteredSongs)[0], index: number) => {
      const items: ContextMenuItem[] = [
        {
          label: t('playlistsPage.removeFromThisPlaylist', 'Remove from this playlist'),
          iconName: 'playlist_remove',
          handlerFunction: () =>
            CollectionClient.removeSongs({ playlistId: playlistData.id, entryIds: [item.entryId] })
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
      ];

      if (canReorder(sortingOrder)) {
        if (index > 0) {
          items.push({
            label: t('playlist.moveToTop', 'Move to Top'),
            iconName: 'vertical_align_top',
            handlerFunction: () => moveSongAbsolute(item.entryId, 0)
          });
          items.push({
            label: t('playlist.moveUp', 'Move Up'),
            iconName: 'arrow_upward',
            handlerFunction: () => moveSongRelative(item.entryId, index, -1)
          });
        }
        if (index < filteredSongs.length - 1) {
          items.push({
            label: t('playlist.moveDown', 'Move Down'),
            iconName: 'arrow_downward',
            handlerFunction: () => moveSongRelative(item.entryId, index, 1)
          });
          items.push({
            label: t('playlist.moveToBottom', 'Move to Bottom'),
            iconName: 'vertical_align_bottom',
            handlerFunction: () => moveSongAbsolute(item.entryId, filteredSongs.length - 1)
          });
        }
      }

      return items;
    },
    [addNewNotifications, filteredSongs.length, moveSongAbsolute, moveSongRelative, playlistData.id, playlistData.name, sortingOrder, t]
  );

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
        true,
        playlistData.name
      ),
    [createQueue, playlistData.id, playlistData.name, filteredSongs]
  );

  const playAllSongs = useCallback(
    () =>
      createQueue(
        filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
        'playlist',
        false,
        playlistData.id,
        true,
        playlistData.name
      ),
    [createQueue, playlistData.id, playlistData.name, filteredSongs]
  );

  const openExportPrompt = useCallback(() => {
    changePromptMenuData(
      true,
      <Suspense fallback={null}>
        <PlaylistExportSettingsPrompt playlistId={playlistData.id} />
      </Suspense>
    );
  }, [changePromptMenuData, playlistData.id]);

  const openImportPrompt = useCallback(async () => {
    const analysis = await CollectionClient.analyze();
    if (!analysis) return;

    changePromptMenuData(
      true,
      <Suspense fallback={null}>
        <PlaylistImportConflictPrompt
          filePath={analysis.filePath}
          targetPlaylistId={playlistData.id}
          playlistName={playlistData.name}
          importedPlaylistName={analysis.playlistName}
          totalEntries={analysis.totalEntries}
          skippedCount={analysis.skippedCount}
          repairedCount={analysis.repairedCount}
        />
      </Suspense>
    );
  }, [changePromptMenuData, playlistData.id, playlistData.name]);

  const searchBar = (
    <PageSearchInput
      key="playlist-search-input"
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
        } else if (e.ctrlKey && e.key === 'z') {
          e.preventDefault();
          if (e.shiftKey) {
            CollectionClient.redo(`local://playlist/${playlistId}`).then(() => {
              queryClient.invalidateQueries({ queryKey: collectionKeys.entries(playlistId) });
            });
          } else {
            CollectionClient.undo(`local://playlist/${playlistId}`).then(() => {
              queryClient.invalidateQueries({ queryKey: collectionKeys.entries(playlistId) });
            });
          }
        } else if (canReorder(sortingOrder) && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          e.stopPropagation();
          const selectedSongIds = store.state.multipleSelectionsData.multipleSelections;
          if (selectedSongIds.length === 1) {
            const targetSongId = selectedSongIds[0];
            const currIdx = filteredSongs.findIndex((s) => s.songId === targetSongId);
            if (currIdx !== -1) {
              const targetEntryId = filteredSongs[currIdx].entryId;
              if (targetEntryId) {
                moveSongRelative(targetEntryId, currIdx, e.key === 'ArrowUp' ? -1 : 1);
              }
            }
          }
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
            isVisible: playlistData.id === SpecialPlaylists.History,
            isDisabled: !(playlistData.itemCount > 0)
          },
          {
            tooltipLabel: t('playlist.exportPlaylist', 'Export Playlist'),
            iconName: 'file_download',
            clickHandler: openExportPrompt,
            isVisible:
              playlistData.id !== SpecialPlaylists.History &&
              playlistData.id !== SpecialPlaylists.Favorites,
            isDisabled: !(playlistData.itemCount > 0)
          },
          {
            tooltipLabel: t('playlistsPage.importPlaylist', 'Import Playlist'),
            iconName: 'file_upload',
            clickHandler: openImportPrompt,
            isVisible:
              playlistData.id !== SpecialPlaylists.History &&
              playlistData.id !== SpecialPlaylists.Favorites
          },
          {
            tooltipLabel: t('playlist.addSongs', 'Add songs'),
            iconName: 'playlist_add',
            clickHandler: openAddSongsPrompt,
            isVisible:
              playlistData.id !== SpecialPlaylists.History &&
              playlistData.id !== SpecialPlaylists.Favorites
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
            options: playlistSortOptions,
            onChange: (e) => {
              const order = e.currentTarget.value as SongSortTypes;
              navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) });
            },
            isDisabled: !(playlistData.itemCount > 0)
          }
        ]}
      />
      {filteredSongs.length > 0 && (
        canReorder(sortingOrder) ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable
              droppableId="playlist-droppable"
              mode="virtual"
              renderClone={(provided, _snapshot, rubric) => {
                const item = filteredSongs[rubric.source.index];
                if (!item) return null;
                return (
                  <Song
                    ref={provided.innerRef}
                    provided={provided}
                    isDraggable
                    key={item.entryId || item.songId}
                    index={rubric.source.index}
                    isIndexingSongs={preferences.isSongIndexingEnabled}
                    onPlayClick={handleSongPlayBtnClick}
                    selectAllHandler={selectAllHandler}
                    {...item}
                    trackNo={undefined}
                    additionalContextMenuItems={getContextMenuItems(item, rubric.source.index)}
                  />
                );
              }}
            >
              {(droppableProvided) => (
                <VirtualizedList
                  data={filteredSongs}
                  fixedItemHeight={60}
                  scrollerRef={droppableProvided.innerRef}
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
                  itemContent={(index, item) => (
                    <Draggable
                      key={item.entryId || item.songId}
                      draggableId={String(item.entryId || item.songId)}
                      index={index}
                    >
                      {(draggableProvided) => (
                        <Song
                          key={item.entryId || item.songId}
                          index={index}
                          ref={draggableProvided.innerRef}
                          provided={draggableProvided}
                          isDraggable
                          isIndexingSongs={preferences.isSongIndexingEnabled}
                          onPlayClick={handleSongPlayBtnClick}
                          selectAllHandler={selectAllHandler}
                          {...item}
                          trackNo={undefined}
                          additionalContextMenuItems={getContextMenuItems(item, index)}
                        />
                      )}
                    </Draggable>
                  )}
                />
              )}
            </Droppable>
          </DragDropContext>
        ) : (
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
            itemContent={(index, item) => (
              <Song
                key={item.entryId || index}
                index={index}
                isIndexingSongs={preferences.isSongIndexingEnabled}
                onPlayClick={handleSongPlayBtnClick}
                selectAllHandler={selectAllHandler}
                {...item}
                trackNo={undefined}
                additionalContextMenuItems={getContextMenuItems(item, index)}
              />
            )}
          />
        )
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
          {!SpecialPlaylists.isSpecialPlaylistId(playlistData.id) && (
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
