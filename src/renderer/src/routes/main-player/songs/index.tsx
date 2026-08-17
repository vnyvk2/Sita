import NoSongsImage from '@assets/images/svg/Empty Inbox _Monochromatic.svg';
import Button from '@renderer/components/Button';
import Dropdown, { type DropdownOption } from '@renderer/components/Dropdown';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import PageSearchInput from '@renderer/components/PageSearchInput';
import Song from '@renderer/components/SongsPage/Song';
import { songFilterOptions, songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { artistQuery } from '@renderer/queries/artists';
import { songQuery } from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { lazy, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/songs/')({
  validateSearch: songSearchSchema,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    filteringOrder: search.filteringOrder,
    keyword: search.keyword
  }),
  loader: async ({ deps }) => {
    const sortingState = store.state.localStorage.sortingStates.songsPage;
    await queryClient.ensureQueryData(
      songQuery.all({
        sortType: deps.sortingOrder ?? sortingState ?? 'aToZ',
        filterType: deps.filteringOrder ?? 'notSelected',
        start: 0,
        end: 0,
        keyword: deps.keyword ?? ''
      })
    );
    await queryClient.ensureQueryData(
      artistQuery.all({
        sortType: 'aToZ',
        filterType: 'favorites',
        start: 0,
        end: 0
      })
    );
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
    toggleMultipleSelections,
    updateContextMenuData,
    changePromptMenuData,
    updateQueueData
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

  const {
    data: { data: songData }
  } = useSuspenseQuery(
    songQuery.all({
      sortType: sortingOrder,
      filterType: filteringOrder,
      start: 0,
      end: 0,
      keyword: keyword ?? ''
    })
  );

  const {
    data: { data: favoriteArtistsData }
  } = useSuspenseQuery(
    artistQuery.all({ sortType: 'aToZ', filterType: 'favorites', start: 0, end: 0 })
  );

  const favoriteArtistIds = useMemo(() => {
    if (!favoriteArtistsData) return new Set<number>();
    return new Set(favoriteArtistsData.map((artist) => artist.artistId));
  }, [favoriteArtistsData]);

  const { availableLanguages, availableGenres } = useMemo(() => {
    if (!songData || songData.length === 0) {
      return { availableLanguages: [] as string[], availableGenres: [] as string[] };
    }
    const langs = new Set<string>();
    const genres = new Set<string>();

    for (const item of songData) {
      const song = item as SongData;
      if (song.language && song.language.trim() !== '') {
        langs.add(song.language.trim());
      }
      if ('genres' in song && song.genres && Array.isArray(song.genres)) {
        for (const g of song.genres) {
          if (g.name && g.name.trim() !== '') {
            genres.add(g.name.trim());
          }
        }
      }
    }

    return {
      availableLanguages: Array.from(langs).sort(),
      availableGenres: Array.from(genres).sort()
    };
  }, [songData]);

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

  const filteredSongs = useMemo(() => {
    if (!songData) return [];

    const hasSubFilters =
      (language && language !== 'all') ||
      (genre && genre !== 'all') ||
      onlyFavoriteArtists ||
      onlyFavoriteAlbums;

    if (!hasSubFilters) return songData;

    return songData.filter((song) => {
      // 1. Language filter
      if (language && language !== 'all') {
        if (language === 'unspecified') {
          if (song.language && song.language.trim() !== '') return false;
        } else {
          if (song.language?.toLowerCase() !== language.toLowerCase()) return false;
        }
      }

      // 2. Genre filter
      if (genre && genre !== 'all') {
        const hasGenre =
          'genres' in song && song.genres
            ? (song as SongData).genres!.some((g) => g.name.toLowerCase() === genre.toLowerCase())
            : false;
        if (!hasGenre) return false;
      }

      // 3. Favorite Artist filter (song has at least one favorited artist)
      if (onlyFavoriteArtists) {
        const hasFavArtist = song.artists?.some((a) => favoriteArtistIds.has(a.artistId));
        if (!hasFavArtist) return false;
      }

      // 4. Favorite Album filter (song's album is favorited)
      if (onlyFavoriteAlbums) {
        const isFavAlbum = Boolean(song.album?.isAFavorite);
        if (!isFavAlbum) return false;
      }

      return true;
    });
  }, [songData, language, genre, onlyFavoriteArtists, onlyFavoriteAlbums, favoriteArtistIds]);

  const filteredSongsRef = useRef(filteredSongs);
  filteredSongsRef.current = filteredSongs;

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
          queryClient.invalidateQueries(
            songQuery.all({
              sortType: sortingOrder,
              filterType: filteringOrder,
              start: 0,
              end: 0
            })
          );
        }}
      />
    );
  }, [changePromptMenuData, filteringOrder, sortingOrder]);

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

  const selectAllHandler = useSelectAllHandler(filteredSongs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId: number) => {
      const queueSongIds = filteredSongsRef.current
        .filter((song) => !song.isBlacklisted)
        .map((song) => song.songId);
      createQueue(
        queueSongIds,
        'songs',
        false,
        undefined,
        false,
        t('common.allSongs', 'All Songs')
      );
      updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, t]
  );

  const renderSong = useCallback(
    (index: number, song: SongData | AudioInfo | undefined) => {
      if (song)
        return (
          <Song
            index={index}
            isIndexingSongs={isSongIndexingEnabled}
            onPlayClick={handleSongPlayBtnClick}
            selectAllHandler={selectAllHandler}
            {...(song as SongData)}
          />
        );
      return <div>Bad Index</div>;
    },
    [isSongIndexingEnabled, handleSongPlayBtnClick, selectAllHandler]
  );

  const hasActiveSubFilters =
    (language && language !== 'all') ||
    (genre && genre !== 'all') ||
    onlyFavoriteArtists ||
    onlyFavoriteAlbums;

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
              filteredSongs &&
              filteredSongs.length > 0 && (
                <span className="no-of-songs">
                  {t('common.songWithCount', {
                    count: filteredSongs.length
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
            clickHandler={() =>
              createQueue(
                filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
                'songs',
                false,
                undefined,
                true
              )
            }
          />
          <Button
            key={3}
            tooltipLabel={t('common.shuffleAndPlay')}
            className="shuffle-and-play-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
            iconName="shuffle"
            clickHandler={() =>
              createQueue(
                filteredSongs.filter((song) => !song.isBlacklisted).map((song) => song.songId),
                'songs',
                true,
                undefined,
                true
              )
            }
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

      <div className="sub-filters-container mb-4 flex flex-wrap items-center gap-2 pr-4 text-xs md:text-sm">
        <Dropdown
          name="songsPageLanguageDropdown"
          type={`${t('common.language', 'Language')} :`}
          value={language}
          options={languageDropdownOptions}
          onChange={(e) => {
            navigate({
              search: (prev) => ({
                ...prev,
                language: e.currentTarget.value === 'all' ? undefined : e.currentTarget.value
              })
            });
          }}
        />
        <Dropdown
          name="songsPageGenreDropdown"
          type={`${t('common.genre', 'Genre')} :`}
          value={genre}
          options={genreDropdownOptions}
          onChange={(e) => {
            navigate({
              search: (prev) => ({
                ...prev,
                genre: e.currentTarget.value === 'all' ? undefined : e.currentTarget.value
              })
            });
          }}
        />
        <Button
          key="fav-artists-filter-btn"
          className={`fav-artists-filter-btn rounded-3xl px-3 py-1 text-xs md:text-sm ${
            onlyFavoriteArtists
              ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black!'
              : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50'
          }`}
          iconName={onlyFavoriteArtists ? 'star' : 'star_outline'}
          label={t('common.favoriteArtists', 'Favorite Artists')}
          clickHandler={() => {
            navigate({
              search: (prev) => ({
                ...prev,
                onlyFavoriteArtists: prev.onlyFavoriteArtists ? undefined : true
              })
            });
          }}
        />
        <Button
          key="fav-albums-filter-btn"
          className={`fav-albums-filter-btn rounded-3xl px-3 py-1 text-xs md:text-sm ${
            onlyFavoriteAlbums
              ? 'bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black!'
              : 'bg-background-color-2/50 dark:bg-dark-background-color-2/50'
          }`}
          iconName={onlyFavoriteAlbums ? 'album' : 'album'}
          label={t('common.favoriteAlbums', 'Favorite Albums')}
          clickHandler={() => {
            navigate({
              search: (prev) => ({
                ...prev,
                onlyFavoriteAlbums: prev.onlyFavoriteAlbums ? undefined : true
              })
            });
          }}
        />
        {hasActiveSubFilters && (
          <Button
            key="clear-sub-filters-btn"
            className="clear-sub-filters-btn ml-1 text-xs opacity-75 hover:opacity-100"
            iconName="filter_alt_off"
            tooltipLabel={t('common.clearFilters', 'Clear sub-filters')}
            clickHandler={() => {
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
          />
        )}
      </div>

      <div className="songs-container appear-from-bottom min-h-0 flex-1 delay-100">
        {filteredSongs && filteredSongs.length > 0 && (
          <VirtualizedList
            data={filteredSongs}
            fixedItemHeight={60}
            scrollKey={scrollKey}
            itemContent={renderSong}
          />
        )}
      </div>
      {filteredSongs.length === 0 && (
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
      )}
    </MainContainer>
  );
}

export default SongsPage;
