import type {
  PlaylistCatalogOptions,
  PlaylistCatalogResult,
  PlaylistDto
} from '@common/collections/dtos';
import { SpecialPlaylists } from '@common/playlists.enum';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DraggableProvided,
  type DropResult,
  type DragUpdate
} from '@hello-pangea/dnd';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { CollectionClient } from '@renderer/api/CollectionClient';
import { collectionKeys } from '@renderer/api/collectionKeys';
import AlphabetScrubber from '@renderer/components/AlphabetScrubber/AlphabetScrubber';
import { getAlphabetScrubberContextMenuItem } from '@renderer/components/AlphabetScrubber/getAlphabetScrubberContextMenu';
import Button from '@renderer/components/Button';
import { type DropdownOption } from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import PageSearchInput from '@renderer/components/PageSearchInput';
import PlaylistInfoAndImgContainer from '@renderer/components/PlaylistsInfoPage/PlaylistInfoAndImgContainer';
import { CompactListHeader } from '@renderer/components/SongsPage/CompactListHeader';
import Song from '@renderer/components/SongsPage/Song';
import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import {
  canReorder,
  playlistSortOptions,
  songFilterOptions,
  type SongSortTypes
} from '@renderer/components/SongsPage/SongOptions';
import { SubFilterToolbar } from '@renderer/components/SongsPage/SubFilterToolbar/SubFilterToolbar';
import TitleContainer from '@renderer/components/TitleContainer';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import {
  collectionDetailOptions,
  playlistCatalogOptions
} from '@renderer/hooks/collections/useCollectionQueries';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { SONG_WINDOW_SIZE } from '@renderer/queries/songs';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { queryClient } from '@renderer/queryClient';
import { scrollRegistry } from '@renderer/utils/scrollStore';
import {
  getPreferredSongRowSize,
  getSongRowHeight,
  resolveSongViewMode,
  setSongViewMode,
  type SongViewMode
} from '@renderer/utils/songViewMode';
import { getSongRowSizeContextMenuItem } from '@renderer/components/SongsPage/getSongRowSizeContextMenu';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import {
  type HTMLAttributes,
  Suspense,
  lazy,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { useTranslation } from 'react-i18next';
import type { ListRange, VirtuosoHandle } from 'react-virtuoso';

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
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    filteringOrder: search.filteringOrder,
    language: search.language,
    keyword: search.keyword
  }),
  loader: async ({ params, deps }) => {
    if (typeof window === 'undefined' || !window.api?.collections) return;
    const playlistId = Number(params.playlistId);
    await queryClient.ensureQueryData(collectionDetailOptions(playlistId));
    const sortingState = storage.sortingStates.getSortingStates('playlistDetailPage');
    const catalogOptions: PlaylistCatalogOptions = {
      sortType: deps?.sortingOrder ?? sortingState ?? 'customOrder',
      filterType: deps?.filteringOrder,
      language: deps?.language && deps.language !== 'all' ? deps.language : undefined,
      keyword: deps?.keyword
    };
    const catalog = await queryClient.fetchQuery(
      playlistCatalogOptions(playlistId, catalogOptions)
    );
    const window0Ids = (catalog.entries ?? [])
      .slice(0, Math.min(SONG_WINDOW_SIZE, (catalog.entries ?? []).length))
      .map((e) => e.songId);
    if (window0Ids.length > 0) {
      const state = queryClient.getQueryState(
        playlistCatalogOptions(playlistId, catalogOptions).queryKey
      );
      const catalogVersion = state?.dataUpdatedAt ?? Date.now();
      const listIdentity = `playlist:${playlistId}:${catalogOptions.sortType}:${catalogOptions.filterType ?? 'notSelected'}:${catalogOptions.language || 'all'}:${catalogOptions.keyword || ''}`;
      await queryClient.ensureQueryData({
        queryKey: ['playlist', 'window', listIdentity, catalogVersion, 0],
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
  component: PlaylistInfoPage
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
  isCompact?: boolean;
  rowSize?: 'normal' | 'small';
};

type PlaylistVirtuosoContext = {
  playlistData: PlaylistDto;
  filteredCount?: number;
  totalDuration?: number;
  isDraggingActive: boolean;
  isCompact: boolean;
  songViewMode: SongViewMode;
};

const HeightPreservingItem = memo(function HeightPreservingItem({
  children,
  item,
  context,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  'data-known-size'?: number;
  item?: unknown;
  context?: unknown;
}) {
  const virtuosoCtx = context as PlaylistVirtuosoContext | undefined;
  const isCompact = virtuosoCtx?.isCompact;
  const standardHeight = virtuosoCtx?.songViewMode === 'small' ? 48 : 60;
  const size = props['data-known-size'] ?? (isCompact ? 38 : standardHeight);
  return (
    <div {...props} style={{ ...props.style, minHeight: size, boxSizing: 'border-box' }}>
      {children}
    </div>
  );
});
HeightPreservingItem.displayName = 'HeightPreservingItem';

const PlaylistHeader = memo(function PlaylistHeader({
  context
}: {
  context?: PlaylistVirtuosoContext;
}) {
  if (!context) return null;
  return (
    <div className={context.isDraggingActive ? 'pointer-events-none select-none' : undefined}>
      <PlaylistInfoAndImgContainer
        playlist={context.playlistData}
        filteredCount={context.filteredCount}
        totalDuration={context.totalDuration}
      />
      {context.isCompact && <CompactListHeader />}
    </div>
  );
});
PlaylistHeader.displayName = 'PlaylistHeader';

const virtuosoComponents = {
  Header: PlaylistHeader,
  Item: HeightPreservingItem
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
    buildContextMenuItems,
    isCompact = false,
    rowSize = 'normal'
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
        isCompact={isCompact}
        rowSize={rowSize}
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
  const isCompactSongView = useStore(store, (state) =>
    Boolean(state.localStorage.preferences.isCompactSongView)
  );
  const songViewMode = useStore(store, (state) =>
    resolveSongViewMode(state.localStorage.preferences)
  );
  const songRowSize = useStore(store, (state) =>
    getPreferredSongRowSize(state.localStorage.preferences)
  );
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const latestVisibleRangeRef = useRef<ListRange | undefined>(undefined);
  const preToggleAnchorIndexRef = useRef<number | null>(null);

  const {
    updateQueueData,
    changePromptMenuData,
    addNewNotifications,
    createQueue,
    playSong,
    updateContextMenuData
  } = useContext(AppUpdateContext);
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
  const [isDraggingActive, setIsDraggingActive] = useState(false);
  const lastDestinationIndexRef = useRef<number | null>(null);

  const scrollKey = useMemo(
    () =>
      `playlist-songs:${playlistId}:${sortingOrder}:${filteringOrder}:${language || 'all'}:${keyword || ''}`,
    [playlistId, sortingOrder, filteringOrder, language, keyword]
  );

  const handleToggleRowSize = useCallback(
    (newSize: 'normal' | 'small') => {
      const currentAnchor =
        latestVisibleRangeRef.current?.startIndex ??
        (scrollKey ? scrollRegistry.getIndex(scrollKey) : 0) ??
        0;
      preToggleAnchorIndexRef.current = currentAnchor;
      if (scrollKey) {
        scrollRegistry.set(scrollKey, { index: currentAnchor });
      }
      setSongViewMode(newSize);
    },
    [scrollKey]
  );

  const handleToggleCompactView = useCallback(() => {
    const currentAnchor =
      latestVisibleRangeRef.current?.startIndex ??
      (scrollKey ? scrollRegistry.getIndex(scrollKey) : 0) ??
      0;
    preToggleAnchorIndexRef.current = currentAnchor;
    if (scrollKey) {
      scrollRegistry.set(scrollKey, { index: currentAnchor });
    }
    const targetMode = isCompactSongView
      ? (songRowSize === 'small' ? 'small' : 'normal')
      : 'compact';
    setSongViewMode(targetMode);
  }, [isCompactSongView, scrollKey, songRowSize]);

  useLayoutEffect(() => {
    if (preToggleAnchorIndexRef.current === null) return;
    const targetIndex = preToggleAnchorIndexRef.current;
    preToggleAnchorIndexRef.current = null;

    virtuosoRef.current?.scrollToIndex({
      index: targetIndex,
      align: 'start',
      behavior: 'auto'
    });
    requestAnimationFrame(() => {
      virtuosoRef.current?.scrollToIndex({
        index: targetIndex,
        align: 'start',
        behavior: 'auto'
      });
    });
  }, [isCompactSongView, songViewMode]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistDetailPage', sortingOrder);
  }, [sortingOrder]);

  const { data: playlistData } = useSuspenseQuery(collectionDetailOptions(playlistId));

  if (!playlistData) {
    throw new Error('Playlist not found');
  }

  const catalogOptions: PlaylistCatalogOptions = useMemo(
    () => ({
      sortType: sortingOrder,
      filterType: filteringOrder,
      language: language && language !== 'all' ? language : undefined,
      keyword
    }),
    [sortingOrder, filteringOrder, language, keyword]
  );

  const catalogQuery = useSuspenseQuery(playlistCatalogOptions(playlistId, catalogOptions));
  const catalogData = catalogQuery.data;
  const entries = catalogData.entries;
  const songIds = useMemo(() => entries.map((e) => e.songId), [entries]);
  const catalogVersion = catalogQuery.dataUpdatedAt;
  const listIdentity = useMemo(
    () =>
      `playlist:${playlistId}:${sortingOrder}:${filteringOrder}:${language || 'all'}:${keyword || ''}`,
    [playlistId, sortingOrder, filteringOrder, language, keyword]
  );

  const blacklistedSet = useMemo(
    () => new Set(catalogData.blacklistedIds ?? []),
    [catalogData.blacklistedIds]
  );

  const playableSongIds = useMemo(
    () => songIds.filter((id) => !blacklistedSet.has(id)),
    [songIds, blacklistedSet]
  );

  const { getItem, onRangeChange } = useWindowHydration(songIds, catalogVersion, {
    enabled: songIds.length > 0,
    keyPrefix: 'playlist',
    listIdentity,
    isCompactView: isCompactSongView,
    rowHeight: isCompactSongView ? 38 : getSongRowHeight(songViewMode)
  });

  const availableLanguages = catalogData.languages ?? [];

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

  const selectAllHandler = useSelectAllHandler(playableSongIds, 'songs');

  const alphabetScrubberPosition = preferences?.alphabetScrubberPosition ?? 'off';

  const alphabetMap = catalogData.alphabetMap;
  const letterCounts = catalogData.letterCounts;

  const [activeLetter, setActiveLetter] = useState<string | undefined>(undefined);
  const activeLetterRef = useRef<string | undefined>(undefined);
  activeLetterRef.current = activeLetter;

  const alphabetEntries = useMemo(() => {
    if (!alphabetMap) return [];
    return Object.entries(alphabetMap).sort(([, a], [, b]) => a - b);
  }, [alphabetMap]);

  const handleListRangeChange = useCallback(
    (range: ListRange) => {
      latestVisibleRangeRef.current = range;
      if (alphabetEntries.length === 0) return;

      const startIndex = range.startIndex;
      let currentLetter = alphabetEntries[0][0];
      for (let i = 0; i < alphabetEntries.length; i++) {
        if (alphabetEntries[i][1] <= startIndex) {
          currentLetter = alphabetEntries[i][0];
        } else {
          break;
        }
      }

      if (currentLetter !== activeLetterRef.current) {
        setActiveLetter(currentLetter);
      }
    },
    [alphabetEntries]
  );

  const handleCombinedRangeChange = useCallback(
    (range: ListRange) => {
      handleListRangeChange(range);
      onRangeChange(range);
    },
    [handleListRangeChange, onRangeChange]
  );

  const handleSelectLetter = useCallback(
    (_letter: string, targetIndex: number) => {
      virtuosoRef.current?.scrollToIndex({
        index: Math.min(targetIndex, entries.length - 1),
        align: 'start',
        behavior: 'auto'
      });
    },
    [entries.length]
  );

  const getMoreOptionsMenuItems = useCallback(
    (): ContextMenuItem[] => [
      getAlphabetScrubberContextMenuItem({
        t,
        currentPosition: alphabetScrubberPosition,
        currentSortOrder: sortingOrder,
        onAutoSwitchSort: (order) => {
          navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) });
        }
      }),
      getSongRowSizeContextMenuItem({
        t,
        currentRowSize: songRowSize,
        currentViewMode: songViewMode,
        onRowSizeChange: (newSize) => {
          handleToggleRowSize(newSize);
        }
      })
    ],
    [
      alphabetScrubberPosition,
      handleToggleRowSize,
      navigate,
      songRowSize,
      songViewMode,
      sortingOrder,
      t
    ]
  );

  const normalizedKeyword = keyword?.trim();
  const shouldShowScrubber =
    alphabetScrubberPosition !== 'off' &&
    !normalizedKeyword &&
    (sortingOrder === 'aToZ' || sortingOrder === 'zToA') &&
    Boolean(alphabetMap && Object.keys(alphabetMap).length > 0);

  const virtuosoContext = useMemo<PlaylistVirtuosoContext>(
    () => ({
      playlistData,
      filteredCount: isFilteredView ? catalogData.total : undefined,
      totalDuration: catalogData.totalDuration,
      isDraggingActive,
      isCompact: isCompactSongView,
      songViewMode
    }),
    [
      playlistData,
      isFilteredView,
      catalogData.total,
      catalogData.totalDuration,
      isDraggingActive,
      isCompactSongView,
      songViewMode
    ]
  );

  const handleReorder = useCallback(
    async (entryId: number, targetPosition: number, sourceIndex?: number) => {
      if (!reorderEnabled || entryId <= 0) return;

      const queryKey = collectionKeys.catalog(playlistId, catalogOptions);
      const previousCatalog = queryClient.getQueryData<PlaylistCatalogResult>(queryKey);

      if (sourceIndex !== undefined && previousCatalog && Array.isArray(previousCatalog.entries)) {
        queryClient.setQueryData<PlaylistCatalogResult>(queryKey, (oldCatalog) => {
          if (!oldCatalog) return oldCatalog;
          const nextEntries = [...oldCatalog.entries];
          const realSourceIndex = nextEntries.findIndex((e) => e.entryId === entryId);
          if (realSourceIndex === -1) return oldCatalog;
          const [moved] = nextEntries.splice(realSourceIndex, 1);
          nextEntries.splice(targetPosition, 0, moved);
          return {
            ...oldCatalog,
            entries: nextEntries
          };
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
        if (previousCatalog) {
          queryClient.setQueryData(queryKey, previousCatalog);
        }
      }
      // Server-state refresh is owned by CollectionEventProvider reacting to the
      // backend's CollectionChanged event - no extra invalidation here.
    },
    [playlistId, reorderEnabled, catalogOptions]
  );

  const moveSongAbsolute = useCallback(
    (entryId: number, targetIndex: number, sourceIndex?: number) => {
      handleReorder(entryId, targetIndex, sourceIndex);
    },
    [handleReorder]
  );

  const moveSongRelative = useCallback(
    (entryId: number, currentIndex: number, delta: number) => {
      const newPos = Math.max(0, Math.min(entries.length - 1, currentIndex + delta));
      if (newPos !== currentIndex) {
        handleReorder(entryId, newPos, currentIndex);
      }
    },
    [entries.length, handleReorder]
  );

  const handleDragStart = useCallback(() => {
    setIsDraggingActive(true);
    lastDestinationIndexRef.current = null;
  }, []);

  const handleDragUpdate = useCallback((update: DragUpdate) => {
    if (update.destination) {
      lastDestinationIndexRef.current = update.destination.index;
    }
  }, []);

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      setIsDraggingActive(false);

      if (!reorderEnabled) {
        lastDestinationIndexRef.current = null;
        return;
      }

      // Guard: Cancelled gestures (e.g. ESC key) must always abort without salvaging
      if (result.reason !== 'DROP') {
        lastDestinationIndexRef.current = null;
        return;
      }

      const lastTracked = lastDestinationIndexRef.current;
      lastDestinationIndexRef.current = null;

      let destIndex: number | null = null;
      if (result.destination) {
        destIndex = result.destination.index;
      } else if (lastTracked === 0) {
        // Salvage drops at the extreme top edge (e.g. into the header or top scroller boundary)
        destIndex = 0;
      } else if (lastTracked !== null && lastTracked === entries.length - 1) {
        // Salvage drops at the extreme bottom edge
        destIndex = entries.length - 1;
      }

      // Mid-list out-of-bounds drop leaves destIndex null -> cleanly cancel
      if (destIndex === null) return;

      const sourceIndex = result.source.index;
      if (sourceIndex === destIndex) return;

      const entryId = Number(result.draggableId);
      if (entryId > 0) {
        moveSongAbsolute(entryId, destIndex, sourceIndex);
      }
    },
    [entries.length, moveSongAbsolute, reorderEnabled]
  );

  const getContextMenuItems = useCallback(
    (item: PlaylistRowSong, index: number) => {
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
            handlerFunction: () => moveSongAbsolute(item.entryId, 0, index)
          });
          items.push({
            label: t('playlist.moveUp', 'Move Up'),
            iconName: 'arrow_upward',
            handlerFunction: () => moveSongRelative(item.entryId, index, -1)
          });
        }
        if (index < entries.length - 1) {
          items.push({
            label: t('playlist.moveDown', 'Move Down'),
            iconName: 'arrow_downward',
            handlerFunction: () => moveSongRelative(item.entryId, index, 1)
          });
          items.push({
            label: t('playlist.moveToBottom', 'Move to Bottom'),
            iconName: 'vertical_align_bottom',
            handlerFunction: () => moveSongAbsolute(item.entryId, entries.length - 1, index)
          });
        }
      }

      return items;
    },
    [
      addNewNotifications,
      entries.length,
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
        existingSongIds={entries.map((s) => s.songId)}
      />
    );
  }, [changePromptMenuData, playlistData.id, playlistData.name, entries]);

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const targetIndex = playableSongIds.indexOf(currSongId);
      if (targetIndex === -1) return;

      const manager = getQueuesManager();
      const activeQueue = manager.getActiveQueue();
      const activeMeta = activeQueue?.getMetadata();

      // If this playlist is already the active queue, navigate within it instead of creating a new queue
      if (activeMeta?.queueType === 'playlist' && activeMeta?.queueId === playlistData.id) {
        const isQueueInSync =
          activeQueue.songIds.length === playableSongIds.length &&
          activeQueue.songIds.every((id, idx) => id === playableSongIds[idx]);

        if (isQueueInSync) {
          updateQueueData(targetIndex, undefined, false, true);
        } else {
          updateQueueData(targetIndex, playableSongIds, false, true);
        }
        return;
      }

      // If a queue for this playlist already exists in the queue tabs, switch to it
      const existingQueueIndex = manager.queues.findIndex((q) => {
        const meta = q.getMetadata();
        return meta.queueType === 'playlist' && meta.queueId === playlistData.id;
      });

      if (existingQueueIndex !== -1) {
        const targetQueue = manager.queues[existingQueueIndex];
        if (targetQueue) {
          targetQueue.replaceQueue(playableSongIds, targetIndex, false);
        }
        manager.switchQueue(existingQueueIndex);
        if (playableSongIds[targetIndex] !== undefined) {
          playSong(playableSongIds[targetIndex], true);
        }
        return;
      }

      // Otherwise create a new queue for this playlist
      createQueue(
        playableSongIds,
        'playlist',
        false,
        playlistData.id,
        true,
        playlistData.name,
        targetIndex
      );
    },
    [createQueue, updateQueueData, playSong, playlistData.id, playlistData.name, playableSongIds]
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

  const shuffleAndPlaySongs = useCallback(() => {
    if (playableSongIds.length === 0) return;

    const manager = getQueuesManager();
    const activeQueue = manager.getActiveQueue();
    const activeMeta = activeQueue?.getMetadata();

    if (activeMeta?.queueType === 'playlist' && activeMeta?.queueId === playlistData.id) {
      updateQueueData(0, playableSongIds, true, true);
      return;
    }

    createQueue(playableSongIds, 'playlist', true, playlistData.id, true, playlistData.name);
  }, [createQueue, updateQueueData, playlistData.id, playlistData.name, playableSongIds]);

  const playAllSongs = useCallback(() => {
    if (playableSongIds.length === 0) return;

    const manager = getQueuesManager();
    const activeQueue = manager.getActiveQueue();
    const activeMeta = activeQueue?.getMetadata();

    if (activeMeta?.queueType === 'playlist' && activeMeta?.queueId === playlistData.id) {
      updateQueueData(0, playableSongIds, false, true);
      return;
    }

    const existingQueueIndex = manager.queues.findIndex((q) => {
      const meta = q.getMetadata();
      return meta.queueType === 'playlist' && meta.queueId === playlistData.id;
    });

    if (existingQueueIndex !== -1) {
      manager.switchQueue(existingQueueIndex);
      updateQueueData(0, playableSongIds, false, true);
      return;
    }

    createQueue(playableSongIds, 'playlist', false, playlistData.id, true, playlistData.name);
  }, [createQueue, updateQueueData, playlistData.id, playlistData.name, playableSongIds]);

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
              queryClient.invalidateQueries({ queryKey: collectionKeys.catalogRoot(playlistId) });
            })
            .catch((err) => console.error(err));
        } else if (reorderEnabled && e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault();
          e.stopPropagation();
          const selectedSongIds = store.state.multipleSelectionsData.multipleSelections;
          if (selectedSongIds.length === 1) {
            const targetSongId = selectedSongIds[0];
            const currIdx = entries.findIndex((s) => s.songId === targetSongId);
            if (currIdx !== -1) {
              const targetEntryId = entries[currIdx].entryId;
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
            className:
              'more-options-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0',
            iconName: 'more_horiz',
            tooltipLabel: t('common.moreOptions'),
            clickHandler: (e) => {
              e.stopPropagation();
              const button = e.currentTarget;
              const { x, y } = button.getBoundingClientRect();
              updateContextMenuData(true, getMoreOptionsMenuItems(), x + 10, y + 50);
            },
            onContextMenu: (e) => {
              e.preventDefault();
              updateContextMenuData(true, getMoreOptionsMenuItems(), e.pageX, e.pageY);
            }
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
              if (alphabetScrubberPosition !== 'off' && order !== 'aToZ' && order !== 'zToA') {
                storage.preferences.setPreferences('alphabetScrubberPosition', 'off');
              }
              navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) });
            },
            isDisabled: !(playlistData.itemCount > 0)
          }
        ]}
      />
      <div className="pr-4">
        <SubFilterToolbar
          context="playlist"
          isCompact={isCompactSongView}
          onToggleCompact={handleToggleCompactView}
          songViewMode={songViewMode}
          language={language}
          languageOptions={languageDropdownOptions}
          onLanguageChange={(val) => {
            navigate({
              search: (prev) => ({
                ...prev,
                language: val === 'all' ? undefined : val
              })
            });
          }}
          hasActiveSubFilters={Boolean(language && language !== 'all')}
          onClearSubFilters={() => {
            navigate({
              search: (prev) => ({
                ...prev,
                language: undefined
              })
            });
          }}
          isLibraryEmpty={playlistData.itemCount === 0}
        />
      </div>
      {entries.length > 0 && (
        <div className="playlist-songs-container appear-from-bottom flex min-h-0 flex-1 flex-col delay-100">
          {shouldShowScrubber && alphabetScrubberPosition === 'top-horizontal' && (
            <AlphabetScrubber
              alphabetMap={alphabetMap}
              letterCounts={letterCounts}
              position="top-horizontal"
              sortOrder={sortingOrder as 'aToZ' | 'zToA'}
              activeLetter={activeLetter}
              onSelectLetter={handleSelectLetter}
              className="mr-4"
            />
          )}
          <div className="flex min-h-0 w-full flex-1">
            {shouldShowScrubber && alphabetScrubberPosition === 'left-vertical' && (
              <AlphabetScrubber
                alphabetMap={alphabetMap}
                letterCounts={letterCounts}
                position="left-vertical"
                sortOrder={sortingOrder as 'aToZ' | 'zToA'}
                activeLetter={activeLetter}
                onSelectLetter={handleSelectLetter}
              />
            )}
            <div className="flex h-full min-w-0 flex-1 flex-col">
              {reorderEnabled ? (
                <DragDropContext
                  onDragStart={handleDragStart}
                  onDragUpdate={handleDragUpdate}
                  onDragEnd={handleDragEnd}
                  autoScrollerOptions={{
                    startFromPercentage: 0.15,
                    maxScrollAtPercentage: 0.05
                  }}
                >
                  <Droppable
                    droppableId="playlist-droppable"
                    mode="virtual"
                    ignoreContainerClipping={true}
                    renderClone={(provided, renderCloneSnapshot, rubric) => {
                      const entryId = Number(rubric.draggableId);
                      const entry =
                        entries.find((e) => e.entryId === entryId) ??
                        entries[rubric.source.index];
                      if (!entry) return null;
                      const song = getItem(rubric.source.index);
                      if (!song) return null;
                      const item: PlaylistRowSong = {
                        ...song,
                        entryId: entry.entryId
                      };
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
                          isCompact={isCompactSongView}
                          rowSize={songViewMode === 'small' ? 'small' : 'normal'}
                        />
                      );
                    }}
                  >
                    {(droppableProvided) => (
                      <VirtualizedList
                        key={isCompactSongView ? 'compact' : `standard-${songViewMode}`}
                        ref={virtuosoRef}
                        data={entries}
                        fixedItemHeight={isCompactSongView ? 38 : getSongRowHeight(songViewMode)}
                        scrollerRef={droppableProvided.innerRef}
                        scrollKey={scrollKey}
                        // scrollSeekConfiguration={false} is necessary during drag-and-drop auto-scrolling
                        // to prevent placeholder rendering from detaching the hello-pangea drag handle.
                        scrollSeekConfiguration={false}
                        increaseViewportBy={{ top: 800, bottom: 800 }}
                        context={virtuosoContext}
                        components={virtuosoComponents}
                        onChange={handleCombinedRangeChange}
                        computeItemKey={(index, item) =>
                          item?.entryId ? `entry-${item.entryId}` : `row-${index}`
                        }
                        itemContent={(index, item) => {
                          const song = getItem(index);
                          if (!song) {
                            return <SongRowSkeleton index={index} isCompact={isCompactSongView} />;
                          }
                          const rowSong: PlaylistRowSong = {
                            ...song,
                            entryId: item.entryId
                          };
                          return (
                            <Draggable
                              key={item.entryId || item.songId}
                              draggableId={String(item.entryId || item.songId)}
                              index={index}
                            >
                              {(draggableProvided, draggableSnapshot) => (
                                <PlaylistRow
                                  key={item.entryId || item.songId}
                                  item={rowSong}
                                  index={index}
                                  isIndexingSongs={preferences.isSongIndexingEnabled}
                                  onPlayClick={handleSongPlayBtnClick}
                                  selectAllHandler={selectAllHandler}
                                  provided={draggableProvided}
                                  isDragging={
                                    draggableSnapshot.isDragging && !draggableSnapshot.isDropAnimating
                                  }
                                  buildContextMenuItems={getContextMenuItems}
                                  isCompact={isCompactSongView}
                                  rowSize={songViewMode === 'small' ? 'small' : 'normal'}
                                />
                              )}
                            </Draggable>
                          );
                        }}
                      />
                    )}
                  </Droppable>
                </DragDropContext>
              ) : (
                <VirtualizedList
                  key={isCompactSongView ? 'compact' : `standard-${songViewMode}`}
                  ref={virtuosoRef}
                  data={entries}
                  fixedItemHeight={isCompactSongView ? 38 : getSongRowHeight(songViewMode)}
                  scrollKey={scrollKey}
                  context={virtuosoContext}
                  components={virtuosoComponents}
                  onChange={handleCombinedRangeChange}
                  computeItemKey={(index, item) =>
                    item?.entryId ? `entry-${item.entryId}` : `row-${index}`
                  }
                  itemContent={(index, item) => {
                    const song = getItem(index);
                    if (!song) {
                      return <SongRowSkeleton index={index} isCompact={isCompactSongView} />;
                    }
                    const rowSong: PlaylistRowSong = {
                      ...song,
                      entryId: item.entryId
                    };
                    return (
                      <PlaylistRow
                        key={item.entryId || index}
                        item={rowSong}
                        index={index}
                        isIndexingSongs={preferences.isSongIndexingEnabled}
                        onPlayClick={handleSongPlayBtnClick}
                        selectAllHandler={selectAllHandler}
                        buildContextMenuItems={getContextMenuItems}
                        isCompact={isCompactSongView}
                        rowSize={songViewMode === 'small' ? 'small' : 'normal'}
                      />
                    );
                  }}
                />
              )}
            </div>
          </div>
        </div>
      )}
      {playlistData.itemCount > 0 && entries.length === 0 && (
        <div className="flex h-full grow flex-col">
          <PlaylistInfoAndImgContainer
            playlist={playlistData}
            filteredCount={0}
            totalDuration={0}
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
      {playlistData.itemCount === 0 && (
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
