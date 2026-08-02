import NoPlaylistsImage from '@assets/images/svg/Empty Inbox _Monochromatic.svg';
import { CollectionClient } from '@renderer/api/CollectionClient';
import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import NavLink from '@renderer/components/NavLink';
import { Playlist } from '@renderer/components/PlaylistsPage/Playlist';
import { playlistSortOptions } from '@renderer/components/PlaylistsPage/PlaylistOptions';
import SecondaryContainer from '@renderer/components/SecondaryContainer';
import VirtualizedGrid from '@renderer/components/VirtualizedGrid';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { queryClient } from '@renderer/index';
import { rootCollectionsOptions } from '@renderer/hooks/collections/useCollectionQueries';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { playlistSearchSchema } from '@renderer/utils/zod/playlistSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import PageSearchInput from '@renderer/components/PageSearchInput';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { Suspense, lazy, useCallback, useContext, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import favoritesPlaylistCoverImage from '../../../assets/images/webp/favorites-playlist-icon.webp';
import historyPlaylistCoverImage from '../../../assets/images/webp/history-playlist-icon.webp';

export const Route = createFileRoute('/main-player/playlists/')({
  validateSearch: playlistSearchSchema,
  component: PlaylistsPage,
  loaderDeps: ({ search }) => ({
    sortingOrder: search.sortingOrder
  }),
  loader: async ({ deps }) => {
    await queryClient.ensureQueryData(
      rootCollectionsOptions(deps.sortingOrder || 'aToZ')
    );
  }
});

const NewPlaylistPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/NewPlaylistPrompt')
);
const MergePlaylistsPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/MergePlaylistsPrompt')
);
const PlaylistBatchExportSettingsPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/PlaylistBatchExportSettingsPrompt')
);

const MIN_ITEM_WIDTH = 175;
const MIN_ITEM_HEIGHT = 220;

function PlaylistsPage() {
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const playlistsPageSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates.playlistsPage
  );
  const { sortingOrder = playlistsPageSortingState || 'aToZ', keyword } = Route.useSearch();
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );

  const { changePromptMenuData, updateContextMenuData, toggleMultipleSelections } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: playlists } = useSuspenseQuery(
    rootCollectionsOptions(sortingOrder)
  );

  const search = usePageSearch({
    keyword,
    updateSearch: (val) =>
      navigate({
        search: (prev) => ({ ...prev, keyword: val || undefined }),
        replace: true
      })
  });

  const filteredPlaylists = useMemo(() => {
    const q = keyword?.trim();
    if (!q) return playlists;
    const lowerQ = q.toLowerCase();
    return playlists.filter((p) => p.name.toLowerCase().includes(lowerQ));
  }, [playlists, keyword]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('playlistsPage', sortingOrder);
  }, [sortingOrder]);

  const selectAllHandler = useSelectAllHandler(filteredPlaylists, 'playlist', 'playlistId');

  const createNewPlaylist = useCallback(
    () =>
      changePromptMenuData(
        true,
        <NewPlaylistPrompt
          currentPlaylists={playlists}
          updatePlaylists={() => {} /* queries are invalidated via CollectionEventProvider */}
        />
      ),
    [changePromptMenuData, playlists, sortingOrder]
  );

  return (
    <MainContainer
      className="main-container appear-from-bottom playlists-list-container mb-0 h-full! pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'f') {
          e.preventDefault();
          e.stopPropagation();
          search.inputRef.current?.focus();
        }
      }}
      onContextMenu={(e) =>
        updateContextMenuData(
          true,
          [
            {
              label: t('playlistsPage.createNewPlaylist'),
              handlerFunction: createNewPlaylist,
              iconName: 'add'
            },
            {
              label: t('playlistsPage.importPlaylist'),
              iconName: 'publish',
              handlerFunction: () =>
                CollectionClient.import().catch((err) => console.error(err))
            }
          ],
          e.pageX,
          e.pageY
        )
      }
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      <>
        <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-8 flex items-center pr-4 text-3xl font-medium">
          <div className="container flex">
            {t('common.playlist_other')}{' '}
            <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
              {isMultipleSelectionEnabled ? (
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {t('common.selectionWithCount', {
                    count: multipleSelectionsData.multipleSelections.length
                  })}
                </div>
              ) : (
                <span className="no-of-artists">
                  {t('common.playlistWithCount', { count: playlists.length })}
                </span>
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
              placeholder={t('playlistsPage.searchPlaylists', 'Search playlists...')}
            />
            {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'playlist' && (
              <>
                <Button
                  key="select-all-btn"
                  className="select-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                  iconName="select_all"
                  clickHandler={() => selectAllHandler()}
                  tooltipLabel={t('common.selectAll')}
                />
                {multipleSelectionsData.multipleSelections.length > 0 && (
                  <Button
                    key="batch-export-playlists-btn"
                    label={t('playlistsPage.export', 'Export')}
                    className="batch-export-playlists-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                    iconName="file_upload"
                    clickHandler={() => {
                      const selectedPlaylistIds = multipleSelectionsData.multipleSelections.map(Number);
                      changePromptMenuData(
                        true,
                        <Suspense fallback={null}>
                          <PlaylistBatchExportSettingsPrompt
                            playlistIds={selectedPlaylistIds}
                          />
                        </Suspense>
                      );
                    }}
                    tooltipLabel={t('playlistsPage.exportSelectedPlaylists', 'Export selected playlists')}
                  />
                )}
                {multipleSelectionsData.multipleSelections.length >= 2 && (
                  <Button
                    key="merge-playlists-btn"
                    label={t('playlistsPage.merge', 'Merge')}
                    className="merge-playlists-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                    iconName="call_merge"
                    clickHandler={() => {
                      const sourcePlaylistIds = multipleSelectionsData.multipleSelections.map(Number);
                      const sourcePlaylistNames = playlists
                        .filter((p) => sourcePlaylistIds.includes(p.id))
                        .map((p) => p.name);
                      changePromptMenuData(
                        true,
                        <MergePlaylistsPrompt
                          sourcePlaylistIds={sourcePlaylistIds}
                          sourcePlaylistNames={sourcePlaylistNames}
                        />
                      );
                    }}
                    tooltipLabel={t('playlistsPage.mergePlaylistsTitle', 'Merge selected playlists')}
                  />
                )}
              </>
            )}
            <Button
              className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName={isMultipleSelectionEnabled ? 'remove_done' : 'checklist'}
              clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'playlist')}
              tooltipLabel={t(`common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`)}
              isDisabled={playlists.length === 0}
            />
            <Button
              label={t(`playlistsPage.importPlaylist`)}
              className="import-playlist-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName="publish"
              clickHandler={(_, setIsDisabled, setIsPending) => {
                setIsDisabled(true);
                setIsPending(true);

                return CollectionClient
                  .import()
                  .finally(() => {
                    setIsDisabled(false);
                    setIsPending(false);
                  })
                  .catch((err) => console.error(err));
              }}
            />
            <Button
              label={t(`playlistsPage.addPlaylist`)}
              className="add-new-playlist-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName="add"
              clickHandler={createNewPlaylist}
            />
            <Dropdown
              name="playlistsSortDropdown"
              value={sortingOrder}
              options={playlistSortOptions}
              onChange={(e) => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    sortingOrder: e.currentTarget.value as PlaylistSortTypes
                  })
                });
              }}
            />
          </div>
        </div>

        {playlists.length > 0 && (
          <div className="playlists-container appear-from-bottom flex h-full flex-wrap delay-100">
            <VirtualizedGrid
              components={{
                Header: () => (
                  <SecondaryContainer className="appear-from-bottom h-fit max-h-full w-full pb-4">
                    <div className="flex gap-4">
                      <NavLink
                        to="/main-player/playlists/favorites"
                        className="bg-background-color-2/70 hover:bg-background-color-2! dark:bg-dark-background-color-2/70 dark:hover:bg-dark-background-color-2! text-font-color dark:text-dark-font-color flex h-24 min-w-60 items-center gap-4 rounded-xl px-4 py-4"
                      >
                        <Img
                          src={favoritesPlaylistCoverImage}
                          className="aspect-square h-full w-auto rounded-lg"
                        />
                        <span className="text-xl">Favorites</span>
                      </NavLink>
                      <NavLink
                        to="/main-player/playlists/history"
                        className="bg-background-color-2/70 hover:bg-background-color-2! dark:bg-dark-background-color-2/70 dark:hover:bg-dark-background-color-2! text-font-color dark:text-dark-font-color flex h-24 min-w-60 items-center gap-4 rounded-xl px-4 py-4"
                      >
                        <Img
                          src={historyPlaylistCoverImage}
                          className="aspect-square h-full w-auto rounded-lg"
                        />
                        <span className="text-xl">History</span>
                      </NavLink>
                    </div>
                  </SecondaryContainer>
                )
              }}
              data={filteredPlaylists}
              fixedItemWidth={MIN_ITEM_WIDTH}
              fixedItemHeight={MIN_ITEM_HEIGHT}
              onDebouncedScroll={(range) => {
                navigate({
                  replace: true,
                  search: (prev) => ({ ...prev, scrollTopOffset: range.startIndex })
                });
              }}
              itemContent={(index, playlist) => {
                return <Playlist index={index} selectAllHandler={selectAllHandler} {...playlist} />;
              }}
            />
          </div>
        )}
        {playlists.length > 0 && filteredPlaylists.length === 0 && (
          <div className="no-playlists-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <span className="material-icons-round-outlined mb-4 text-5xl">search_off</span>
            <span className="mb-2 font-medium">{t('playlistsPage.noMatchingPlaylistsTitle', 'No matching playlists found')}</span>
            <span className="text-sm opacity-75">{t('playlistsPage.noMatchingPlaylistsDesc', { keyword, defaultValue: `No playlists match "${keyword}"` })}</span>
          </div>
        )}
        {playlists.length === 0 && (
          <div className="no-playlists-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <Img src={NoPlaylistsImage} alt="" className="mb-8 w-60" />
            <span>{t('playlistsPage.empty')}</span>
          </div>
        )}
      </>
    </MainContainer>
  );
}
