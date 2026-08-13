import NoAlbumsImage from '@assets/images/svg/Easter bunny_Monochromatic.svg';
import { Album } from '@renderer/components/AlbumsPage/Album';
import { albumSortOptions } from '@renderer/components/AlbumsPage/AlbumOptions';
import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import PageSearchInput from '@renderer/components/PageSearchInput';
import VirtualizedGrid from '@renderer/components/VirtualizedGrid';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { queryClient } from '@renderer/index';
import { albumQuery } from '@renderer/queries/albums';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { albumSearchSchema } from '@renderer/utils/zod/albumSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useContext, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/albums/')({
  validateSearch: albumSearchSchema,
  component: AlbumsPage,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder,
    keyword: search.keyword
  }),
  loader: async ({ deps }) => {
    const sortingState = store.state.localStorage.sortingStates.albumsPage;
    await queryClient.ensureQueryData(
      albumQuery.all({
        sortType: deps.sortingOrder || sortingState || 'aToZ',
        start: 0,
        end: 0,
        keyword: deps.keyword ?? ''
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
  const { sortingOrder = albumsPageSortingState || 'aToZ', keyword } = Route.useSearch();
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });

  const {
    data: { data: albumsData }
  } = useSuspenseQuery(
    albumQuery.all({
      sortType: sortingOrder,
      start: 0,
      end: 0,
      keyword: keyword ?? ''
    })
  );

  const search = usePageSearch({
    keyword,
    updateSearch: (val) => navigate({ search: (prev) => ({ ...prev, keyword: val }), replace: true })
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
        {albumsData.length > 0 && (
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
                  albumsData.length > 0 && (
                    <span className="no-of-albums">
                      {t('common.albumWithCount', { count: albumsData.length })}
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
              />
              <Dropdown
                name="albumSortDropdown"
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
        )}
        <div
          className={`albums-container h-full w-full grow ${!(albumsData && albumsData.length > 0) && 'hidden'}`}
        >
          {albumsData && albumsData.length > 0 && (
            <VirtualizedGrid
              data={albumsData}
              fixedItemWidth={MIN_ITEM_WIDTH}
              fixedItemHeight={MIN_ITEM_HEIGHT}
              onDebouncedScroll={(range) => {
                navigate({
                  replace: true,
                  search: (prev) => ({ ...prev, scrollTopOffset: range.startIndex })
                });
              }}
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
          )}
        </div>
        {/* {albumsData && albumsData.length === 0 && (
          <div className="no-songs-container my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-2xl text-font-color-dimmed">
            <Img
              src={FetchingDataImage}
              alt="No songs available."
              className="mb-8 w-60"
            />
            <div>We&apos;re already there...</div>
          </div>
        )} */}
        {albumsData && albumsData.length === 0 && (
          <div className="no-songs-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoAlbumsImage} alt="No songs available." className="mb-8 w-60" />
            <div>{t('albumsPage.empty')}</div>
          </div>
        )}
      </>
    </MainContainer>
  );
}
