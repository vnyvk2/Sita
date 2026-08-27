import NoAlbumsImage from '@assets/images/svg/Easter bunny_Monochromatic.svg';
import { Album } from '@renderer/components/AlbumsPage/Album';
import {
  albumFilterOptions,
  albumSortOptions,
  type AlbumFilterTypes,
  type AlbumSortTypes
} from '@renderer/components/AlbumsPage/AlbumOptions';
import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import PageSearchInput from '@renderer/components/PageSearchInput';
import VirtualizedGrid from '@renderer/components/VirtualizedGrid';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import {
  ALBUM_SUMMARY_PAGE_SIZE,
  albumSummariesQuery,
  albumSummariesQueryKey,
  fetchAlbumSummariesPage
} from '@renderer/queries/albums';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { albumSearchSchema } from '@renderer/utils/zod/albumSchema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListRange } from 'react-virtuoso';

export const Route = createFileRoute('/main-player/albums/')({
  validateSearch: albumSearchSchema,
  component: AlbumsPage,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    filteringOrder: search.filteringOrder,
    keyword: search.keyword
  }),
  loader: async ({ deps }) => {
    const sortingState = store.state.localStorage.sortingStates.albumsPage;
    await queryClient.fetchQuery(
      albumSummariesQuery({
        sortType: deps.sortingOrder || sortingState || 'aToZ',
        filterType: deps.filteringOrder || 'notSelected',
        keyword: deps.keyword ?? '',
        start: 0
      })
    );
  }
});

const MIN_ITEM_WIDTH = 220;
const MIN_ITEM_HEIGHT = 280;

function AlbumsPage() {
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const albumsPageSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates.albumsPage
  );

  const { toggleMultipleSelections } = useContext(AppUpdateContext);
  const {
    sortingOrder = albumsPageSortingState || 'aToZ',
    filteringOrder = 'notSelected',
    keyword
  } = Route.useSearch();
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });

  const scrollKey = useMemo(
    () => `albums-grid:${sortingOrder}:${filteringOrder}:${keyword || ''}`,
    [sortingOrder, filteringOrder, keyword]
  );

  const summariesQuery = useInfiniteQuery({
    queryKey: albumSummariesQueryKey({
      sortType: sortingOrder,
      filterType: filteringOrder,
      keyword: keyword ?? ''
    }),
    queryFn: ({ pageParam }) =>
      fetchAlbumSummariesPage(
        { sortType: sortingOrder, filterType: filteringOrder, keyword: keyword ?? '' },
        pageParam as number
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (keyword?.trim()) return undefined;
      const fetched = lastPage.end;
      return lastPage.data.length < ALBUM_SUMMARY_PAGE_SIZE ? undefined : fetched;
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  });

  const albumsData = useMemo(
    () => summariesQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [summariesQuery.data]
  );

  const latestRangeRef = useRef<ListRange | null>(null);
  const handleGridRangeChange = useCallback(
    (range: ListRange) => {
      latestRangeRef.current = range;
      if (
        summariesQuery.hasNextPage &&
        !summariesQuery.isFetchingNextPage &&
        range.endIndex >= albumsData.length - 24
      ) {
        summariesQuery.fetchNextPage();
      }
    },
    [albumsData.length, summariesQuery]
  );

  const search = usePageSearch({
    keyword,
    updateSearch: (val) =>
      navigate({ search: (prev) => ({ ...prev, keyword: val }), replace: true })
  });

  // useEffect(() => {
  //   const manageDataUpdatesInAlbumsPage = (e: Event) => {
  //     if ('detail' in e) {
  //       const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
  //       for (let i = 0; i < dataEvents.length; i += 1) {
  //         const event = dataEvents[i];
  //         if (event.dataType === 'albums/newAlbum') fetchAlbumData();
  //         if (event.dataType === 'albums/deletedAlbum') fetchAlbumData();
  //       }
  //     }
  //   };
  //   document.addEventListener('app/dataUpdates', manageDataUpdatesInAlbumsPage);
  //   return () => {
  //     document.removeEventListener('app/dataUpdates', manageDataUpdatesInAlbumsPage);
  //   };
  // }, [fetchAlbumData]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('albumsPage', sortingOrder);
  }, [sortingOrder]);

  const selectAllHandler = useSelectAllHandler(albumsData, 'album', 'albumId');

  const normalizedKeyword = keyword?.trim();
  const hasActiveFilter = Boolean(normalizedKeyword) || filteringOrder !== 'notSelected';
  const isFilteredEmpty = albumsData.length === 0 && hasActiveFilter;
  const isLibraryEmpty = albumsData.length === 0 && !hasActiveFilter;

  return (
    <MainContainer
      className="appear-from-bottom albums-list-container h-full! overflow-hidden pb-0!"
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
      <>
        <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-8 flex items-center pr-4 text-3xl font-medium">
          <div className="container flex">
            {t('common.album_other')}{' '}
            <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
              {isMultipleSelectionEnabled ? (
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {t('common.selectionWithCount', {
                    count: multipleSelectionsData.multipleSelections.length
                  })}
                </div>
              ) : (
                albumsData &&
                albumsData.length > 0 && (
                  <span className="no-of-albums">
                    {t('common.albumWithCount', {
                      count: albumsData.length
                    })}
                  </span>
                )
              )}
            </div>
          </div>
          <div className="other-controls-container flex">
            <PageSearchInput
              inputRef={search.inputRef}
              value={search.value}
              onChange={search.onChange}
              onCompositionStart={search.onCompositionStart}
              onCompositionEnd={search.onCompositionEnd}
              placeholder={t('searchPage.searchPlaceholderAlbums', 'Search albums...')}
            />
            {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'album' && (
              <Button
                key="select-all-btn"
                className="select-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName="select_all"
                clickHandler={() => selectAllHandler()}
                tooltipLabel={t('common.selectAll')}
              />
            )}
            <Button
              tooltipLabel={t(`common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`)}
              className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName={isMultipleSelectionEnabled ? 'remove_done' : 'checklist'}
              clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'album')}
              isDisabled={albumsData.length === 0}
            />
            <Dropdown
              name="albumPageFilterDropdown"
              type={`${t('common.filterBy')} :`}
              value={filteringOrder}
              options={albumFilterOptions}
              onChange={(e) => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    filteringOrder: e.currentTarget.value as AlbumFilterTypes
                  })
                });
              }}
            />
            <Dropdown
              name="albumSortDropdown"
              type={`${t('common.sortBy')} :`}
              value={sortingOrder}
              options={albumSortOptions}
              onChange={(e) => {
                storage.sortingStates.setSortingStates(
                  'albumsPage',
                  e.currentTarget.value as AlbumSortTypes
                );
                navigate({
                  search: (prev) => ({
                    ...prev,
                    sortingOrder: e.currentTarget.value as AlbumSortTypes
                  })
                });
              }}
            />
          </div>
        </div>

        {isFilteredEmpty ? (
          <div className="no-albums-search-container text-font-color-black dark:text-font-color-white my-12 flex h-64 w-full flex-col items-center justify-center text-center">
            <span className="material-icons-round-outlined mb-3 text-4xl opacity-75">
              search_off
            </span>
            <span className="mb-1 text-lg font-medium">
              {t('albumsPage.noMatchingAlbumsTitle', 'No matching albums found')}
            </span>
            <span className="text-xs opacity-70">
              {normalizedKeyword
                ? t('albumsPage.noMatchingAlbumsDesc', {
                    keyword: normalizedKeyword,
                    defaultValue: `No albums match "${normalizedKeyword}"`
                  })
                : t('albumsPage.noFilteredAlbumsDesc', 'No albums match the selected filter')}
            </span>
          </div>
        ) : isLibraryEmpty ? (
          <div className="no-songs-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoAlbumsImage} alt="No songs available." className="mb-8 w-60" />
            <div>{t('albumsPage.empty')}</div>
          </div>
        ) : (
          <div className="albums-container h-full w-full grow">
            <VirtualizedGrid
              data={albumsData}
              fixedItemWidth={MIN_ITEM_WIDTH}
              fixedItemHeight={MIN_ITEM_HEIGHT}
              scrollKey={scrollKey}
              onChange={handleGridRangeChange}
              itemContent={(index, item) => {
                return (
                  <Album
                    index={index}
                    key={`${item.albumId}-${item.title}`}
                    selectAllHandler={selectAllHandler}
                    {...item}
                  />
                );
              }}
            />
          </div>
        )}
      </>
    </MainContainer>
  );
}
