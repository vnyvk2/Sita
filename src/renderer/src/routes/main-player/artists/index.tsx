import NoArtistImage from '@assets/images/svg/Sun_Monochromatic.svg';
import { Artist } from '@renderer/components/ArtistPage/Artist';
import {
  artistFilterOptions,
  artistSortOptions
} from '@renderer/components/ArtistPage/ArtistOptions';
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
  ARTIST_SUMMARY_PAGE_SIZE,
  artistSummariesQuery,
  artistSummariesQueryKey,
  fetchArtistSummariesPage
} from '@renderer/queries/artists';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { artistSearchSchema } from '@renderer/utils/zod/artistSchema';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { ListRange } from 'react-virtuoso';

export const Route = createFileRoute('/main-player/artists/')({
  validateSearch: artistSearchSchema,
  component: ArtistPage,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    filteringOrder: search.filteringOrder,
    keyword: search.keyword
  }),
  loader: async ({ deps }) => {
    const sortingState = store.state.localStorage.sortingStates.artistsPage;
    await queryClient.fetchQuery(
      artistSummariesQuery({
        sortType: deps.sortingOrder || sortingState || 'aToZ',
        filterType: deps.filteringOrder || 'notSelected',
        keyword: deps.keyword ?? '',
        start: 0
      })
    );
  }
});

const MIN_ITEM_WIDTH = 175;
const MIN_ITEM_HEIGHT = 200;

function ArtistPage() {
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);

  const sortingStates = useStore(store, (state) => state.localStorage.sortingStates);

  const { toggleMultipleSelections } = useContext(AppUpdateContext);
  const {
    sortingOrder = sortingStates?.artistsPage || 'aToZ',
    filteringOrder = 'notSelected',
    keyword
  } = Route.useSearch();
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });

  const scrollKey = useMemo(
    () => `artists-grid:${sortingOrder}:${filteringOrder}:${keyword || ''}`,
    [sortingOrder, filteringOrder, keyword]
  );

  const summariesQuery = useInfiniteQuery({
    queryKey: artistSummariesQueryKey({
      sortType: sortingOrder,
      filterType: filteringOrder,
      keyword: keyword ?? ''
    }),
    queryFn: ({ pageParam }) =>
      fetchArtistSummariesPage(
        { sortType: sortingOrder, filterType: filteringOrder, keyword: keyword ?? '' },
        pageParam as number
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      if (keyword?.trim()) return undefined;
      const fetched = lastPage.end;
      return lastPage.data.length < ARTIST_SUMMARY_PAGE_SIZE ? undefined : fetched;
    },
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000
  });

  const artistsData = useMemo(
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
        range.endIndex >= artistsData.length - 24
      ) {
        summariesQuery.fetchNextPage();
      }
    },
    [artistsData.length, summariesQuery]
  );

  const search = usePageSearch({
    keyword,
    updateSearch: (val) =>
      navigate({ search: (prev) => ({ ...prev, keyword: val }), replace: true })
  });
  // useEffect(() => {
  //   const manageArtistDataUpdatesInArtistsPage = (e: Event) => {
  //     if ('detail' in e) {
  //       const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
  //       for (let i = 0; i < dataEvents.length; i += 1) {
  //         const event = dataEvents[i];
  //         if (event.dataType === 'artists/likes' && event.dataType.length > 1) fetchArtistsData();
  //         if (event.dataType === 'artists') fetchArtistsData();
  //       }
  //     }
  //   };
  //   document.addEventListener('app/dataUpdates', manageArtistDataUpdatesInArtistsPage);
  //   return () => {
  //     document.removeEventListener('app/dataUpdates', manageArtistDataUpdatesInArtistsPage);
  //   };
  // }, [fetchArtistsData]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('artistsPage', sortingOrder);
  }, [sortingOrder]);

  const selectAllHandler = useSelectAllHandler(artistsData, 'artist', 'artistId');

  const normalizedKeyword = keyword?.trim();
  const hasActiveFilter = Boolean(normalizedKeyword) || filteringOrder !== 'notSelected';
  const isFilteredEmpty = artistsData.length === 0 && hasActiveFilter;
  const isLibraryEmpty = artistsData.length === 0 && !hasActiveFilter;

  return (
    <MainContainer
      className="appear-from-bottom artists-list-container h-full! overflow-hidden pb-0!"
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
            {t('common.artist_other')}{' '}
            <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
              {isMultipleSelectionEnabled ? (
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {t('common.selectionWithCount', {
                    count: multipleSelectionsData.multipleSelections.length
                  })}
                </div>
              ) : (
                artistsData &&
                artistsData.length > 0 && (
                  <span className="no-of-artists">
                    {t('common.artistWithCount', {
                      count: artistsData.length
                    })}
                  </span>
                )
              )}
            </div>
          </div>
          <div className="other-control-container flex">
            <PageSearchInput
              inputRef={search.inputRef}
              value={search.value}
              onChange={search.onChange}
              onCompositionStart={search.onCompositionStart}
              onCompositionEnd={search.onCompositionEnd}
              placeholder={t('searchPage.searchPlaceholderArtists', 'Search artists...')}
            />
            {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'artist' && (
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
              clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'artist')}
              isDisabled={artistsData.length === 0}
            />
            <Dropdown
              name="artistPageFilterDropdown"
              type={`${t('common.filterBy')} :`}
              value={filteringOrder}
              options={artistFilterOptions}
              onChange={(e) => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    filteringOrder: e.currentTarget.value as ArtistFilterTypes
                  })
                });
              }}
            />
            <Dropdown
              name="artistsSortDropdown"
              type={`${t('common.sortBy')} :`}
              value={sortingOrder}
              options={artistSortOptions}
              onChange={(e) => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    sortingOrder: e.currentTarget.value as ArtistSortTypes
                  })
                });
              }}
            />
          </div>
        </div>

        {isFilteredEmpty ? (
          <div className="no-artists-search-container text-font-color-black dark:text-font-color-white my-12 flex h-64 w-full flex-col items-center justify-center text-center">
            <span className="material-icons-round-outlined mb-3 text-4xl opacity-75">
              search_off
            </span>
            <span className="mb-1 text-lg font-medium">
              {t('artistsPage.noMatchingArtistsTitle', 'No matching artists found')}
            </span>
            <span className="text-xs opacity-70">
              {normalizedKeyword
                ? t('artistsPage.noMatchingArtistsDesc', {
                    keyword: normalizedKeyword,
                    defaultValue: `No artists match "${normalizedKeyword}"`
                  })
                : t('artistsPage.noFilteredArtistsDesc', 'No artists match the selected filter')}
            </span>
          </div>
        ) : isLibraryEmpty ? (
          <div className="no-songs-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoArtistImage} alt="Sun in a desert" className="mb-8 w-60" />
            <div>{t('artistsPage.empty')}</div>
          </div>
        ) : (
          <div className="artists-container flex h-full! flex-wrap">
            <VirtualizedGrid
              data={artistsData}
              fixedItemWidth={MIN_ITEM_WIDTH}
              fixedItemHeight={MIN_ITEM_HEIGHT}
              scrollKey={scrollKey}
              onChange={handleGridRangeChange}
              itemContent={(index, artist) => {
                return (
                  <Artist
                    index={index}
                    key={artist.artistId}
                    className="mb-4"
                    selectAllHandler={selectAllHandler}
                    appearFromBottom={false}
                    {...artist}
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
