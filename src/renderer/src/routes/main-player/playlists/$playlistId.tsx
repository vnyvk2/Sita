import { SpecialPlaylists } from '@common/playlists.enum';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DraggableProvided,
  type DropResult
} from '@hello-pangea/dnd';
import { CollectionClient } from '@renderer/api/CollectionClient';
import { collectionKeys } from '@renderer/api/collectionKeys';
import Button from '@renderer/components/Button';
import { type DropdownOption } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PageSearchInput from '@renderer/components/PageSearchInput';
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
import {
  collectionDetailOptions,
  collectionEntriesOptions
} from '@renderer/hooks/collections/useCollectionQueries';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { songQuery } from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { Suspense, lazy, memo, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

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
    await queryClient.ensureQueryData(collectionDetailOptions(Number(params.playlistId)));
  }
});

type PlaylistRowSong = SongData & { entryId: number };

type PlaylistRowProps = {
  item: PlaylistRowSong;
  index: number;
  isIndexingSongs: boolean;
  onPlayClick?: (currSongId: number) => void;
  selectAllHandler?: (_upToId?: number) => void;
  provided?: DraggableProvided;
  isDragging?: boolean;
  buildContextMenuItems: (item: PlaylistRowSong, index: number) => ContextMenuItem[];
};

/**
 * Memoized row wrapper. Builds context-menu items once per (item, index) instead of allocating a
 * fresh array on every parent render - without this, new prop identities defeat `memo` inside
 * <Song> and every visible row re-renders deeply on each keystroke/drag frame.
 */
const PlaylistRow = memo(
  ({
    item,
    index,
    isIndexingSongs,
    onPlayClick,
    selectAllHandler,
    provided,
    isDragging = false,
    buildContextMenuItems
  }: PlaylistRowProps) => {
    const additionalContextMenuItems = useMemo(
      () => buildContextMenuItems(item, index),
      [buildContextMenuItems, index, item]
    );

    return (
      <Song
        ref={provided?.innerRef}
        provided={provided}
        isDragging={isDragging}
        index={index}
        isIndexingSongs={isIndexingSongs}
        onPlayClick={onPlayClick}
        selectAllHandler={selectAllHandler}
        {...item}
        trackNo={undefined}
        additionalContextMenuItems={additionalContextMenuItems}
      />
    );
  }
);
PlaylistRow.displayName = 'PlaylistRow';

function PlaylistInfoPage() {
  const { playlistId } = Route.useParams({
    select: (params) => ({ playlistId: Number(params.playlistId) })
  });

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
    language = 'all',
    keyword
  } = Route.useSearch();
  const navigate = useNavigate({ from: '/main-player/playlists/$playlistId' });

  // Reordering is only meaningful in the persistent custom order, and only
  // against the FULL list. When any filter (search keyword / language /
  // favorites etc.) shrinks the visible list, row indices no longer match
  // absolute positions - so drag + move actions are disabled until cleared.
  const isFilteredView =
    Boolean(keyword?.trim()) || language !== 'all' || filteringOrder !== 'notSelected';
  const reorderEnabled = canReorder(sortingOrder) && !isFilteredView;

  const scrollKey = useMemo(
    () =>
      `playlist-songs:${playlistId}:${sortingOrder}:${filteringOrder}:${language || 'all'}:${keyword || ''}`,
    [playlistId, sortingOrder, filteringOrder, language, keyword]
  );

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistDetailPage', sortingOrder);
  }, [sortingOrder]);

  const { data: playlistData } = useSuspenseQuery(collectionDetailOptions(playlistId));

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
      const positionOrderedSongs: Array<(typeof rawPlaylistSongs)[0] & { entryId: number }> = [];
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

  const availableLanguages = useMemo(() => {
    if (!playlistSongs || playlistSongs.length === 0) return [];
    const langs = new Set<string>();
    for (const song of playlistSongs) {
      if (song.language && song.language.trim() !== '') {
        langs.add(song.language.trim());
      }
    }
    return Array.from(langs).sort();
  }, [playlistSongs]);

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

  const search = usePageSearch({
    keyword,
    updateSearch: (val) =>
      navigate({
        search: (prev) => ({ ...prev, keyword: val || undefined }),
        replace: true
      })
  });

  const filteredSongs = useMemo(() => {
    let result = playlistSongs;

    if (language && language !== 'all') {
      result = result.filter((song) => {
        if (language === 'unspecified') {
          return !song.language || song.language.trim() === '';
        }
        return song.language?.toLowerCase() === language.toLowerCase();
      });
    }

    const q = keyword?.trim();
    if (!q) return result;
    const lowerQ = q.toLowerCase();

    return result.filter((song) => {
      const titleMatch = song.title?.toLowerCase().includes(lowerQ);
      const artistsStr =
        song.artists
          ?.map((a) => a.name)
          .join(' ')
          .toLowerCase() ?? '';
      const artistMatch = artistsStr.includes(lowerQ);
      const albumMatch = song.album?.name?.toLowerCase().includes(lowerQ);
      const genresStr =
        song.genres
          ?.map((g) => g.name)
          .join(' ')
          .toLowerCase() ?? '';
      const genreMatch = genresStr.includes(lowerQ);
      return titleMatch || artistMatch || albumMatch || genreMatch;
    });
  }, [playlistSongs, keyword, language]);

  const selectAllHandler = useSelectAllHandler(filteredSongs, 'songs', 'songId');

  const handleReorder = useCallback(
    async (entryId: number, targetPosition: number, sourceIndex?: number) => {
      if (!reorderEnabled || entryId <= 0) return;

      const entriesQuery = collectionEntriesOptions(playlistId, undefined, undefined, sortingOrder);
      const previousEntries = queryClient.getQueryData(entriesQuery.queryKey);

      if (sourceIndex !== undefined && previousEntries && Array.isArray(previousEntries)) {
        queryClient.setQueryData(entriesQuery.queryKey, (oldEntries) => {
          if (!oldEntries) return oldEntries;
          const next = [...oldEntries];
          const [moved] = next.splice(sourceIndex, 1);
          next.splice(targetPosition, 0, moved);
          // Keep stored positions in sync with the visual order so nothing
          // downstream reads stale ranks before the refetch lands.
          return next.map((entry, index) =>
            entry.position === index ? entry : { ...entry, position: index }
          );
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
      }
      // Server-state refresh is owned by CollectionEventProvider reacting to the
      // backend's CollectionChanged event - no extra invalidation here.
    },
    [playlistId, reorderEnabled, sortingOrder]
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
      if (!result.destination || !reorderEnabled) return;
      const sourceIndex = result.source.index;
      const destIndex = result.destination.index;
      if (sourceIndex === destIndex) return;

      const draggedSong = filteredSongs[sourceIndex];
      if (draggedSong && draggedSong.entryId > 0) {
        moveSongAbsolute(draggedSong.entryId, destIndex, sourceIndex);
      }
    },
    [filteredSongs, moveSongAbsolute, reorderEnabled]
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

      if (reorderEnabled) {
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
    [
      addNewNotifications,
      filteredSongs.length,
      moveSongAbsolute,
      moveSongRelative,
      playlistData.id,
      playlistData.name,
      reorderEnabled,
      t
    ]
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
      createQueue(queueSongIds, 'playlist', false, playlistData.id, false, playlistData.name);
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
        const activeEl = document.activeElement;
        const isTypingTarget =
          activeEl instanceof HTMLInputElement ||
          activeEl instanceof HTMLTextAreaElement ||
          (activeEl as HTMLElement | null)?.isContentEditable === true;
        if (isTypingTarget) return;

        if (e.ctrlKey && e.key === 'f') {
          e.preventDefault();
          e.stopPropagation();
          search.inputRef.current?.focus();
        } else if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        } else if (e.ctrlKey && e.key === 'z') {
          // Page-scoped undo/redo owner. Refreshes entries directly because
          // UndoEngine does not emit CollectionChanged events.
          e.preventDefault();
          const historyAction = e.shiftKey
            ? CollectionClient.redo(`local://playlist/${playlistId}`)
            : CollectionClient.undo(`local://playlist/${playlistId}`);
          historyAction
            .then(() => {
              queryClient.invalidateQueries({ queryKey: collectionKeys.entries(playlistId) });
            })
            .catch((err) => console.error(err));
        } else if (reorderEnabled && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          e.stopPropagation();
          const selectedSongIds = store.state.multipleSelectionsData.multipleSelections;
          if (selectedSongIds.length === 1) {
            const targetSongId = selectedSongIds[0];
            const currIdx = filteredSongs.findIndex((s) => s.songId === targetSongId);
            if (currIdx !== -1) {
              const targetEntryId = filteredSongs[currIdx].entryId;
              if (targetEntryId > 0) {
                moveSongRelative(targetEntryId, currIdx, e.key === 'ArrowUp' ? -1 : 1);
              }
            }
          }
        }
      }}
    >
      <TitleContainer
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
            name: 'playlistPageLanguageDropdown',
            type: `${t('common.language', 'Language')} :`,
            value: language,
            options: languageDropdownOptions,
            onChange: (e) => {
              const val = e.currentTarget.value;
              navigate({
                search: (prev) => ({
                  ...prev,
                  language: val === 'all' ? undefined : val
                })
              });
            },
            isDisabled: !(playlistData.itemCount > 0)
          },
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
      {filteredSongs.length > 0 &&
        (reorderEnabled ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable
              droppableId="playlist-droppable"
              mode="virtual"
              renderClone={(provided, renderCloneSnapshot, rubric) => {
                const item = filteredSongs[rubric.source.index];
                if (!item) return null;
                return (
                  <PlaylistRow
                    item={item}
                    index={rubric.source.index}
                    isIndexingSongs={preferences.isSongIndexingEnabled}
                    onPlayClick={handleSongPlayBtnClick}
                    selectAllHandler={selectAllHandler}
                    provided={provided}
                    isDragging={renderCloneSnapshot.isDragging}
                    buildContextMenuItems={getContextMenuItems}
                  />
                );
              }}
            >
              {(droppableProvided) => (
                <VirtualizedList
                  data={filteredSongs}
                  fixedItemHeight={60}
                  scrollerRef={droppableProvided.innerRef}
                  scrollKey={scrollKey}
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
                      {(draggableProvided, draggableSnapshot) => (
                        <PlaylistRow
                          key={item.entryId || item.songId}
                          item={item}
                          index={index}
                          isIndexingSongs={preferences.isSongIndexingEnabled}
                          onPlayClick={handleSongPlayBtnClick}
                          selectAllHandler={selectAllHandler}
                          provided={draggableProvided}
                          isDragging={
                            draggableSnapshot.isDragging && !draggableSnapshot.isDropAnimating
                          }
                          buildContextMenuItems={getContextMenuItems}
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
            scrollKey={scrollKey}
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
              <PlaylistRow
                key={item.entryId || index}
                item={item}
                index={index}
                isIndexingSongs={preferences.isSongIndexingEnabled}
                onPlayClick={handleSongPlayBtnClick}
                selectAllHandler={selectAllHandler}
                buildContextMenuItems={getContextMenuItems}
              />
            )}
          />
        ))}
      {playlistSongs.length > 0 && filteredSongs.length === 0 && (
        <div className="flex h-full grow flex-col">
          <PlaylistInfoAndImgContainer
            playlist={playlistData}
            songs={playlistSongs}
            filteredSongs={filteredSongs}
          />
          <div className="no-songs-container appear-from-bottom text-font-color-black dark:text-font-color-white relative flex h-full grow flex-col items-center justify-center py-12 text-center text-lg font-light opacity-80!">
            <span className="material-icons-round-outlined mb-4 text-5xl">search_off</span>
            <span className="mb-2 text-xl font-medium">
              {t('searchPage.noResultsTitle', 'No matching songs found')}
            </span>
            <span className="text-sm opacity-75">
              {t('searchPage.noResultsDesc', {
                keyword,
                defaultValue: `No songs match "${keyword}" in this playlist.`
              })}
            </span>
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
