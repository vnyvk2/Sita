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
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import { queryClient } from '@renderer/queryClient';
import { artistQuery } from '@renderer/queries/artists';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { artistSearchSchema } from '@renderer/utils/zod/artistSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

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
    await queryClient.ensureQueryData(
      artistQuery.all({
        sortType: deps.sortingOrder || sortingState || 'aToZ',
        filterType: deps.filteringOrder || 'notSelected',
        keyword: deps.keyword ?? '',
        start: 0,
        end: 0
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
  const { scrollTopOffset, sortingOrder = sortingStates?.artistsPage || 'aToZ', filteringOrder = 'notSelected', keyword } =
    Route.useSearch();
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });

  const {
    data: { data: artistsData }
  } = useSuspenseQuery(artistQuery.all({ sortType: sortingOrder, filterType: filteringOrder, start: 0, end: 0, keyword: keyword ?? '' }));

  const search = usePageSearch({
    keyword,
    updateSearch: (val) => navigate({ search: (prev) => ({ ...prev, keyword: val }), replace: true })
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
        {artistsData.length > 0 && (
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
        )}
        <div
          className={`artists-container flex h-full! flex-wrap ${!(artistsData && artistsData.length > 0) ? 'hidden' : ''}`}
        >
          {artistsData && artistsData.length > 0 && (
            <VirtualizedGrid
              data={artistsData}
              fixedItemWidth={MIN_ITEM_WIDTH}
              fixedItemHeight={MIN_ITEM_HEIGHT}
              scrollTopOffset={scrollTopOffset}
              onDebouncedScroll={(range) => {
                navigate({
                  replace: true,
                  search: (prev) => ({ ...prev, scrollTopOffset: range.startIndex })
                });
              }}
              itemContent={(index, artist) => {
                return (
                  <Artist
                    index={index}
                    key={artist.artistId}
                    className="mb-4"
                    songIds={artist.songs.map((song) => song.songId)}
                    selectAllHandler={selectAllHandler}
                    appearFromBottom={false}
                    {...artist}
                  />
                );
              }}
            />
          )}
        </div>
        {/* {artistsData && artistsData.length === 0 && (
          <div className="no-songs-container my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl text-font-color-black dark:text-font-color-white">
            <Img
              src={FetchingDataImage}
              alt="No songs available."
              className="mb-8 w-60"
            />
            <div>What about a Lemonade? They are cool, right ?</div>
          </div>
        )} */}
        {artistsData && artistsData.length === 0 && (
          <div className="no-songs-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoArtistImage} alt="Sun in a desert" className="mb-8 w-60" />
            <div>{t('artistsPage.empty')}</div>
          </div>
        )}
      </>
    </MainContainer>
  );
}
