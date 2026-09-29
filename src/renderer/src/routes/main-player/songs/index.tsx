/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import NoSongsImage from '@assets/images/svg/Empty Inbox _Monochromatic.svg';
import AlphabetScrubber from '@renderer/components/AlphabetScrubber/AlphabetScrubber';
import Button from '@renderer/components/Button';
import Dropdown, { type DropdownOption } from '@renderer/components/Dropdown';
import DuplicateSongsCleanupPrompt from '@renderer/components/DuplicateSongsCleanupPrompt';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import PageSearchInput from '@renderer/components/PageSearchInput';
import { CompactListHeader } from '@renderer/components/SongsPage/CompactListHeader';
import Song from '@renderer/components/SongsPage/Song';
import { songFilterOptions, songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import { SubFilterToolbar } from '@renderer/components/SongsPage/SubFilterToolbar/SubFilterToolbar';
import { useSongListContextMenuDelegation } from '@renderer/components/SongsPage/useSongListContextMenuDelegation';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { getLibraryVersion } from '@renderer/other/libraryVersion';
import { getQueuesManager } from '@renderer/other/queuesManager';
import {
  getSongRowHeight,
  resolveSongViewMode,
  setSongViewMode,
  type SongViewMode
} from '@renderer/utils/songViewMode';
import {
  SONG_WINDOW_SIZE,
  SONG_WINDOW_STALE_TIME,
  getSongListIdentity,
  songCacheKeys,
  songIdsVersionFromState,
  songQuery,
  type SongIdsParams
} from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { scrollRegistry } from '@renderer/utils/scrollStore';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import {
  lazy,
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

export const Route = createFileRoute('/main-player/songs/')({
  validateSearch: songSearchSchema,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    filteringOrder: search.filteringOrder,
    keyword: search.keyword,
    language: search.language,
    genre: search.genre,
    onlyFavoriteArtists: search.onlyFavoriteArtists,
    onlyFavoriteAlbums: search.onlyFavoriteAlbums
  }),
  loader: async ({ deps }) => {
    const sortingState = store.state.localStorage.sortingStates.songsPage;
    const idsParams: SongIdsParams = {
      sortType: deps.sortingOrder ?? sortingState ?? 'aToZ',
      filterType: deps.filteringOrder ?? 'notSelected',
      keyword: deps.keyword ?? '',
      language: deps.language ?? 'all',
      genre: deps.genre ?? 'all',
      onlyFavoriteArtists: deps.onlyFavoriteArtists ?? false,
      onlyFavoriteAlbums: deps.onlyFavoriteAlbums ?? false
    };
    const idsData = await queryClient.fetchQuery(songQuery.ids(idsParams));
    const state = queryClient.getQueryState(songQuery.ids(idsParams).queryKey);
    const version = songIdsVersionFromState(state?.dataUpdatedAt);
    const listIdentity = getSongListIdentity(idsParams);
    await queryClient.ensureQueryData({
      queryKey: songCacheKeys.window(listIdentity, version, 0),
      queryFn: () =>
        window.api.audioLibraryControls.getSongInfo(
          idsData.ids.slice(0, Math.min(SONG_WINDOW_SIZE, idsData.ids.length)),
          undefined,
          undefined,
          undefined,
          true
        ),
      staleTime: SONG_WINDOW_STALE_TIME
    });
  },
  component: SongsPage
});

const AddMusicFoldersPrompt = lazy(
  () => import('@renderer/components/MusicFoldersPage/AddMusicFoldersPrompt')
);

function SongsPage() {
  const songsPageSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates.songsPage
  );
  const isSongIndexingEnabled = useStore(
    store,
    (state) => state.localStorage.preferences.isSongIndexingEnabled
  );
  const alphabetScrubberPosition = useStore(
    store,
    (state) => state.localStorage.preferences.alphabetScrubberPosition ?? 'off'
  );
  const isCompactSongView = useStore(store, (state) =>
    Boolean(state.localStorage.preferences.isCompactSongView)
  );
  const songViewMode = useStore(store, (state) =>
    resolveSongViewMode(state.localStorage.preferences)
  );
  const preToggleAnchorIndexRef = useRef<number | null>(null);
  const latestVisibleRangeRef = useRef<ListRange | undefined>(undefined);

  // Single parent-level subscription passed to all Song rows via prop,
  // eliminating ~25 per-row store subscriptions in the hot scrolling path.
  const hasBodyBackgroundImage = useStore(store, (state) => Boolean(state.bodyBackgroundImage));
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.isEnabled &&
      state.multipleSelectionsData.selectionType === 'songs'
  );
  const multipleSelectionsCount = useStore(
    store,
    (state) => state.multipleSelectionsData.multipleSelections.length
  );
  const isMultipleSelectionEmpty = useStore(
    store,
    (state) =>
      state.multipleSelectionsData.multipleSelections.length === 0 ||
      state.multipleSelectionsData.selectionType !== 'songs'
  );

  const {
    createQueue,
    playAllSongs,
    toggleMultipleSelections,
    updateContextMenuData,
    changePromptMenuData
  } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const {
    sortingOrder = songsPageSortingState || 'aToZ',
    filteringOrder = 'notSelected',
    action,
    queueIndex,
    keyword,
    language = 'all',
    genre = 'all',
    onlyFavoriteArtists = false,
    onlyFavoriteAlbums = false
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const scrollKey = useMemo(
    () =>
      `songs-list:${sortingOrder}:${filteringOrder}:${keyword || ''}:${genre || 'all'}:${language || 'all'}:${onlyFavoriteArtists}:${onlyFavoriteAlbums}`,
    [
      sortingOrder,
      filteringOrder,
      keyword,
      genre,
      language,
      onlyFavoriteArtists,
      onlyFavoriteAlbums
    ]
  );

  const handleViewModeChange = useCallback(
    (newMode: SongViewMode) => {
      const currentAnchor =
        latestVisibleRangeRef.current?.startIndex ??
        (scrollKey ? scrollRegistry.getIndex(scrollKey) : 0) ??
        0;
      preToggleAnchorIndexRef.current = currentAnchor;
      if (scrollKey) {
        scrollRegistry.set(scrollKey, { index: currentAnchor });
      }
      setSongViewMode(newMode);
    },
    [scrollKey]
  );

  const handleToggleCompactView = useCallback(() => {
    const nextMode: SongViewMode = songViewMode === 'compact' ? 'normal' : 'compact';
    handleViewModeChange(nextMode);
  }, [handleViewModeChange, songViewMode]);

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
  }, [songViewMode]);

  const songIdsParams = useMemo(
    () => ({
      sortType: sortingOrder,
      filterType: filteringOrder,
      keyword: keyword ?? '',
      language,
      genre,
      onlyFavoriteArtists,
      onlyFavoriteAlbums
    }),
    [
      sortingOrder,
      filteringOrder,
      keyword,
      language,
      genre,
      onlyFavoriteArtists,
      onlyFavoriteAlbums
    ]
  );

  const idsQuery = useSuspenseQuery(songQuery.ids(songIdsParams));
  const listIdentity = useMemo(() => getSongListIdentity(songIdsParams), [songIdsParams]);

  const filteredSongIds = idsQuery.data.ids;
  const blacklistedIds = idsQuery.data.blacklistedIds;
  const alphabetMap = idsQuery.data.alphabetMap;
  const letterCounts = idsQuery.data.letterCounts;
  const idsVersion = songIdsVersionFromState(idsQuery.dataUpdatedAt);

  const blacklistedSet = useMemo(() => new Set(blacklistedIds), [blacklistedIds]);
  const playableSongIds = useMemo(
    () => filteredSongIds.filter((id) => !blacklistedSet.has(id)),
    [filteredSongIds, blacklistedSet]
  );
  const playableSongIdsRef = useRef(playableSongIds);
  playableSongIdsRef.current = playableSongIds;

  const {
    data: { languages: availableLanguages, genres: availableGenres }
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

  const genreDropdownOptions: DropdownOption<string>[] = useMemo(() => {
    const options: DropdownOption<string>[] = [
      { label: t('common.allGenres', 'All Genres'), value: 'all' }
    ];
    if (availableGenres.length > 0) {
      options.push({ label: '', value: 'divider', isDivider: true });
      for (const g of availableGenres) {
        options.push({ label: g, value: g });
      }
    }
    return options;
  }, [availableGenres, t]);

  // An unfiltered All Songs view is canonical-eligible: it projects the whole library.
  // Any active keyword or sub-filter makes the request a contextual (filtered browse) queue
  const trimmedKeyword = keyword?.trim();
  const isCanonicalEligibleView = useMemo(
    () =>
      !trimmedKeyword &&
      filteringOrder === 'notSelected' &&
      (!language || language === 'all') &&
      (!genre || genre === 'all') &&
      !onlyFavoriteArtists &&
      !onlyFavoriteAlbums,
    [trimmedKeyword, filteringOrder, language, genre, onlyFavoriteArtists, onlyFavoriteAlbums]
  );

  const canonicalQueueTitle = t('common.allSongs', 'All Songs');

  // Library version the currently rendered list was derived from.
  const songDataLibraryVersion = useMemo(() => getLibraryVersion(), [filteredSongIds]);

  const contextualQueueTitle = useMemo(() => {
    const detail =
      trimmedKeyword ||
      (genre && genre !== 'all' ? genre : undefined) ||
      (language && language !== 'all' ? language : undefined) ||
      songFilterOptions.find((option) => option.value === filteringOrder)?.label ||
      (onlyFavoriteArtists
        ? t('songsPage.favoriteArtistsFilter', 'Favorite Artists')
        : undefined) ||
      (onlyFavoriteAlbums ? t('songsPage.favoriteAlbumsFilter', 'Favorite Albums') : undefined);
    return detail ? `${canonicalQueueTitle}: ${detail}` : canonicalQueueTitle;
  }, [
    t,
    trimmedKeyword,
    genre,
    language,
    filteringOrder,
    onlyFavoriteArtists,
    onlyFavoriteAlbums,
    canonicalQueueTitle
  ]);

  const search = usePageSearch({
    keyword,
    updateSearch: (val) =>
      navigate({ search: (prev) => ({ ...prev, keyword: val }), replace: true })
  });

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

  useEffect(() => {
    storage.sortingStates.setSortingStates('songsPage', sortingOrder);
  }, [sortingOrder]);

  useEffect(() => {
    if (action === 'add-to-queue' && !isMultipleSelectionEnabled) {
      toggleMultipleSelections(true, 'songs');
    }
  }, [action, isMultipleSelectionEnabled, toggleMultipleSelections]);

  useEffect(() => {
    return () => {
      // Clean up multiple selections state when unmounting
      toggleMultipleSelections(false, 'songs');
    };
  }, [toggleMultipleSelections]);

  const addNewSongs = useCallback(() => {
    changePromptMenuData(
      true,
      <AddMusicFoldersPrompt
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: songQuery.ids._def });
        }}
      />
    );
  }, [changePromptMenuData]);

  const importAppData = useCallback(
    (
      _: unknown,
      setIsDisabled: (state: boolean) => void,
      setIsPending: (state: boolean) => void
    ) => {
      setIsDisabled(true);
      setIsPending(true);

      return window.api.settingsHelpers
        .importAppData()
        .then((res) => {
          if (res) storage.setAllItems(res);
          return undefined;
        })
        .finally(() => {
          setIsDisabled(false);
          setIsPending(false);
        })
        .catch((err) => console.error(err));
    },
    []
  );

  const selectAllHandler = useSelectAllHandler(filteredSongIds, 'songs');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = playableSongIdsRef.current;
      if (queueSongIds.length === 0) return;

      if (isCanonicalEligibleView) {
        playAllSongs({
          songIds: queueSongIds,
          startSongId: currSongId,
          sortingOrder,
          builtAtLibraryVersion: songDataLibraryVersion,
          title: canonicalQueueTitle
        });
      } else {
        const targetIndex = queueSongIds.indexOf(currSongId);
        if (targetIndex === -1) return;
        createQueue(
          queueSongIds,
          'songs',
          false,
          undefined,
          true,
          contextualQueueTitle,
          targetIndex
        );
      }
    },
    [
      createQueue,
      playAllSongs,
      isCanonicalEligibleView,
      canonicalQueueTitle,
      contextualQueueTitle,
      sortingOrder,
      songDataLibraryVersion
    ]
  );

  const savedPosition = scrollKey ? scrollRegistry.get(scrollKey) : undefined;
  const searchParams = Route.useSearch();
  const initialScrollIndex =
    typeof searchParams.scrollTopOffset === 'number'
      ? searchParams.scrollTopOffset
      : (savedPosition?.index ?? 0);

  const fixedItemHeight = getSongRowHeight(songViewMode);

  const { getItem, onRangeChange } = useWindowHydration(filteredSongIds, idsVersion, {
    listIdentity,
    initialIndex: initialScrollIndex,
    isCompactView: isCompactSongView,
    rowHeight: fixedItemHeight
  });

  const {
    handleContextMenu: handleContainerContextMenu,
    handleClick: handleContainerClick
  } = useSongListContextMenuDelegation({
    getItem,
    isCompact: isCompactSongView,
    onPlayClick: handleSongPlayBtnClick
  });

  const renderSong = useCallback(
    (index: number) => {
      const song = getItem(index);
      if (song) {
        return (
          <Song
            index={index}
            isIndexingSongs={isSongIndexingEnabled}
            onPlayClick={handleSongPlayBtnClick}
            selectAllHandler={selectAllHandler}
            hasBodyBackgroundImage={hasBodyBackgroundImage}
            isCompact={isCompactSongView}
            isDelegated={true}
            rowSize={songViewMode === 'small' ? 'small' : 'normal'}
            {...song}
          />
        );
      }
      return (
        <SongRowSkeleton
          index={index}
          isCompact={isCompactSongView}
          rowSize={songViewMode === 'small' ? 'small' : 'normal'}
        />
      );
    },
    [
      getItem,
      isSongIndexingEnabled,
      handleSongPlayBtnClick,
      selectAllHandler,
      hasBodyBackgroundImage,
      isCompactSongView,
      songViewMode
    ]
  );

  const virtuosoRef = useRef<VirtuosoHandle>(null);
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
      onRangeChange(range);
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
    [onRangeChange, alphabetEntries]
  );

  const handleSelectLetter = useCallback(
    (_letter: string, targetIndex: number) => {
      virtuosoRef.current?.scrollToIndex({
        index: Math.min(targetIndex, filteredSongIds.length - 1),
        align: 'start',
        behavior: 'auto'
      });
    },
    [filteredSongIds.length]
  );

  const normalizedKeyword = keyword?.trim();
  const shouldShowScrubber =
    alphabetScrubberPosition !== 'off' &&
    !normalizedKeyword &&
    (sortingOrder === 'aToZ' || sortingOrder === 'zToA') &&
    Boolean(alphabetMap && Object.keys(alphabetMap).length > 0);
  const hasActiveSubFilters =
    (language && language !== 'all') ||
    (genre && genre !== 'all') ||
    onlyFavoriteArtists ||
    onlyFavoriteAlbums;

  const hasActiveFilter =
    Boolean(normalizedKeyword) || hasActiveSubFilters || filteringOrder !== 'notSelected';

  const isLibraryEmpty = filteredSongIds.length === 0 && !hasActiveFilter;
  const isFilteredEmpty = filteredSongIds.length === 0 && hasActiveFilter;

  return (
    <MainContainer
      className="main-container appear-from-bottom songs-list-container h-full! overflow-hidden pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
        if (e.ctrlKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          e.stopPropagation();
          search.inputRef.current?.focus();
        }
      }}
    >
      <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-6 flex items-center pr-4 text-3xl font-medium">
        <div className="container flex">
          {t('common.song_other')}{' '}
          <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
            {isMultipleSelectionEnabled ? (
              <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                {t('common.selectionWithCount', {
                  count: multipleSelectionsCount
                })}
              </div>
            ) : (
              filteredSongIds.length > 0 && (
                <span className="no-of-songs">
                  {t('common.songWithCount', {
                    count: filteredSongIds.length
                  })}
                </span>
              )
            )}
          </div>
        </div>
        <div className="other-controls-container flex">
          {action === 'add-to-queue' && (
            <>
              <Button
                key="add-to-queue-btn"
                className="add-to-queue-btn bg-background-color-3 dark:bg-dark-background-color-3 mr-2 flex items-center rounded-full px-4 py-1 text-sm font-semibold shadow-sm md:text-lg"
                iconName="add"
                label={t('currentQueuePage.addSongs', 'Add to Queue')}
                isDisabled={isMultipleSelectionEmpty}
                clickHandler={() => {
                  const manager = getQueuesManager();
                  const targetQueueIndex = queueIndex ?? manager.activeQueueIndex;
                  const targetQueueId = manager.queues[targetQueueIndex]?.id;
                  const currentSelectedIds = store.state.multipleSelectionsData.multipleSelections;

                  if (targetQueueId && currentSelectedIds.length > 0) {
                    manager.addSongsToQueue(targetQueueId, currentSelectedIds as number[]);
                  }

                  toggleMultipleSelections(false, 'songs');
                  navigate({
                    to: '/main-player/queue',
                    search: { queueIndex: targetQueueIndex }
                  });
                }}
              />
              {searchBar}
              <Button
                key="cancel-btn"
                className="cancel-btn mr-2 text-sm md:text-lg"
                iconName="close"
                tooltipLabel={t('common.cancel', 'Cancel')}
                clickHandler={() => {
                  toggleMultipleSelections(false, 'songs');
                  const manager = getQueuesManager();
                  navigate({
                    to: '/main-player/queue',
                    search: { queueIndex: queueIndex ?? manager.activeQueueIndex }
                  });
                }}
              />
            </>
          )}
          {action !== 'add-to-queue' && searchBar}
          <Button
            key={0}
            className="more-options-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
            iconName="more_horiz"
            clickHandler={(e) => {
              e.stopPropagation();
              const button = e.currentTarget;
              const { x, y } = button.getBoundingClientRect();
              updateContextMenuData(
                true,
                [
                  {
                    label: t('settingsPage.resyncLibrary'),
                    iconName: 'sync',
                    handlerFunction: () => window.api.audioLibraryControls.resyncSongsLibrary()
                  }
                ],
                x + 10,
                y + 50
              );
            }}
            tooltipLabel={t('common.moreOptions')}
            onContextMenu={(e) => {
              e.preventDefault();
              updateContextMenuData(
                true,
                [
                  {
                    label: t('settingsPage.resyncLibrary'),
                    iconName: 'sync',
                    handlerFunction: () => window.api.audioLibraryControls.resyncSongsLibrary()
                  }
                ],
                e.pageX,
                e.pageY
              );
            }}
          />
          {isMultipleSelectionEnabled && (
            <Button
              key="select-all-btn"
              className="select-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName="select_all"
              clickHandler={() => selectAllHandler()}
              tooltipLabel={t('common.selectAll')}
            />
          )}
          <Button
            key={1}
            className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
            iconName={isMultipleSelectionEnabled ? 'remove_done' : 'checklist'}
            clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'songs')}
            tooltipLabel={t(`common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`)}
          />
          <Button
            key={2}
            tooltipLabel={t('common.playAll')}
            className="play-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
            iconName="play_arrow"
            clickHandler={() => {
              const queueSongIds = playableSongIdsRef.current;
              if (queueSongIds.length === 0) return;
              if (isCanonicalEligibleView) {
                playAllSongs({
                  songIds: queueSongIds,
                  sortingOrder,
                  builtAtLibraryVersion: songDataLibraryVersion,
                  title: canonicalQueueTitle
                });
              } else {
                createQueue(queueSongIds, 'songs', false, undefined, true, contextualQueueTitle);
              }
            }}
          />
          <Button
            key={3}
            tooltipLabel={t('common.shuffleAndPlay')}
            className="shuffle-and-play-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
            iconName="shuffle"
            clickHandler={() => {
              const queueSongIds = playableSongIdsRef.current;
              if (queueSongIds.length === 0) return;
              if (isCanonicalEligibleView) {
                playAllSongs({
                  songIds: queueSongIds,
                  shuffle: true,
                  sortingOrder,
                  builtAtLibraryVersion: songDataLibraryVersion,
                  title: canonicalQueueTitle
                });
              } else {
                createQueue(queueSongIds, 'songs', true, undefined, true, contextualQueueTitle);
              }
            }}
          />
          <Dropdown
            name="songsPageFilterDropdown"
            type={`${t('common.filterBy')} :`}
            value={filteringOrder}
            options={songFilterOptions}
            onChange={(e) => {
              navigate({
                search: (prev) => ({
                  ...prev,
                  filteringOrder: e.currentTarget.value as SongFilterTypes
                })
              });
            }}
          />
          <Dropdown
            name="songsPageSortDropdown"
            type={`${t('common.sortBy')} :`}
            value={sortingOrder}
            options={songSortOptions}
            onChange={(e) => {
              navigate({
                search: (prev) => ({
                  ...prev,
                  sortingOrder: e.currentTarget.value as SongSortTypes
                })
              });
            }}
          />
        </div>
      </div>

      <SubFilterToolbar
        context="songs"
        isCompact={isCompactSongView}
        onToggleCompact={handleToggleCompactView}
        songViewMode={songViewMode}
        onViewModeChange={handleViewModeChange}
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
        genre={genre}
        genreOptions={genreDropdownOptions}
        onGenreChange={(val) => {
          navigate({
            search: (prev) => ({
              ...prev,
              genre: val === 'all' ? undefined : val
            })
          });
        }}
        onlyFavoriteArtists={onlyFavoriteArtists}
        onToggleFavoriteArtists={() => {
          navigate({
            search: (prev) => ({
              ...prev,
              onlyFavoriteArtists: prev.onlyFavoriteArtists ? undefined : true
            })
          });
        }}
        onlyFavoriteAlbums={onlyFavoriteAlbums}
        onToggleFavoriteAlbums={() => {
          navigate({
            search: (prev) => ({
              ...prev,
              onlyFavoriteAlbums: prev.onlyFavoriteAlbums ? undefined : true
            })
          });
        }}
        hasActiveSubFilters={hasActiveSubFilters}
        onClearSubFilters={() => {
          navigate({
            search: (prev) => ({
              ...prev,
              language: undefined,
              genre: undefined,
              onlyFavoriteArtists: undefined,
              onlyFavoriteAlbums: undefined
            })
          });
        }}
        isLibraryEmpty={isLibraryEmpty}
        onClearDuplicates={() => {
          changePromptMenuData(true, <DuplicateSongsCleanupPrompt />, 'w-[1100px] max-w-[94vw]', {
            scrollBehavior: 'content'
          });
        }}
      />

      {isFilteredEmpty ? (
        <div className="no-songs-search-container text-font-color-black dark:text-font-color-white my-12 flex h-64 w-full flex-col items-center justify-center text-center">
          <span className="material-icons-round-outlined mb-3 text-4xl opacity-75">search_off</span>
          <span className="mb-1 text-lg font-medium">
            {t('songsPage.noMatchingSongsTitle', 'No matching songs found')}
          </span>
          <span className="text-xs opacity-70">
            {normalizedKeyword
              ? t('songsPage.noMatchingSongsDesc', {
                  keyword: normalizedKeyword,
                  defaultValue: `No songs match "${normalizedKeyword}"`
                })
              : t('songsPage.noFilteredSongsDesc', 'No songs match the selected filters')}
          </span>
        </div>
      ) : isLibraryEmpty ? (
        <div className="no-songs-container text-font-color-black dark:text-font-color-white my-[8%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
          <Img src={NoSongsImage} alt="" className="mb-8 w-60" />
          <span>{t('songsPage.empty')}</span>
          <div className="flex items-center justify-between">
            <Button
              label={t('foldersPage.addFolder')}
              iconName="create_new_folder"
              iconClassName="material-icons-round-outlined"
              className="bg-background-color-3! text-font-color-black! hover:border-background-color-3 dark:bg-dark-background-color-3! dark:text-font-color-black! dark:hover:border-background-color-3 mt-4 px-8 text-lg"
              clickHandler={addNewSongs}
            />
            <Button
              label={t('settingsPage.importAppData')}
              iconName="upload"
              className="bg-background-color-3! text-font-color-black! hover:border-background-color-3 dark:bg-dark-background-color-3! dark:text-font-color-black! dark:hover:border-background-color-3 mt-4 px-8 text-lg"
              clickHandler={importAppData}
            />
          </div>
        </div>
      ) : (
        <div className="songs-container appear-from-bottom flex min-h-0 flex-1 flex-col delay-100">
          {shouldShowScrubber && alphabetScrubberPosition === 'top-horizontal' && (
            <AlphabetScrubber
              alphabetMap={alphabetMap}
              letterCounts={letterCounts}
              position="top-horizontal"
              sortOrder={sortingOrder as 'aToZ' | 'zToA'}
              activeLetter={activeLetter}
              onSelectLetter={handleSelectLetter}
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
            <div className="@container/songs flex h-full min-w-0 flex-1 flex-col">
              {isCompactSongView && <CompactListHeader />}
              <div
                className="min-h-0 flex-1"
                onContextMenu={handleContainerContextMenu}
                onClick={handleContainerClick}
              >
                <VirtualizedList
                  key={isCompactSongView ? 'compact' : `standard-${songViewMode}`}
                  ref={virtuosoRef}
                  data={filteredSongIds}
                  fixedItemHeight={fixedItemHeight}
                  scrollKey={scrollKey}
                  itemContent={renderSong}
                  onChange={handleListRangeChange}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </MainContainer>
  );
}

export default SongsPage;
