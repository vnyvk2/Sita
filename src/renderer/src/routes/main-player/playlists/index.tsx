import NoPlaylistsImage from '@assets/images/svg/Empty Inbox _Monochromatic.svg';
import { CollectionClient } from '@renderer/api/CollectionClient';
import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import NavLink from '@renderer/components/NavLink';
import PageSearchInput from '@renderer/components/PageSearchInput';
import { Playlist } from '@renderer/components/PlaylistsPage/Playlist';
import { playlistSortOptions } from '@renderer/components/PlaylistsPage/PlaylistOptions';
import SecondaryContainer from '@renderer/components/SecondaryContainer';
import VirtualizedGrid from '@renderer/components/VirtualizedGrid';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { rootCollectionsOptions } from '@renderer/hooks/collections/useCollectionQueries';
import { usePageSearch } from '@renderer/hooks/usePageSearch';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { playlistSearchSchema } from '@renderer/utils/zod/playlistSchema';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { Suspense, lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
    await queryClient.ensureQueryData(rootCollectionsOptions(deps.sortingOrder || 'aToZ'));
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
const MissingSongsCheckerPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/MissingSongsCheckerPrompt')
);
const SpotifyToM3uConverterPrompt = lazy(
  () => import('@renderer/components/PlaylistsPage/SpotifyToM3uConverterPrompt')
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
  const scrollKey = useMemo(
    () => `playlists-grid:${sortingOrder}:${keyword || ''}`,
    [sortingOrder, keyword]
  );
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );

  const { changePromptMenuData, updateContextMenuData, toggleMultipleSelections } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });

  const { data: playlists } = useSuspenseQuery(rootCollectionsOptions(sortingOrder));

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

  const selectAllHandler = useSelectAllHandler(filteredPlaylists, 'playlist', 'id');

  const createNewPlaylist = useCallback(
    () => changePromptMenuData(true, <NewPlaylistPrompt currentPlaylists={playlists} />),
    [changePromptMenuData, playlists]
  );

  const handleAddPlaylistClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const clientX = 'clientX' in e ? e.clientX : 0;
      const clientY = 'clientY' in e ? e.clientY : 0;
      updateContextMenuData(
        true,
        [
          {
            label: t('playlistsPage.createPlaylist', 'New Standard Playlist'),
            iconName: 'queue_music',
            handlerFunction: createNewPlaylist
          },
          {
            label: 'New Smart Playlist',
            iconName: 'auto_awesome',
            handlerFunction: () => navigate({ to: '/main-player/playlists/smart-editor' })
          }
        ],
        clientX,
        clientY
      );
    },
    [updateContextMenuData, createNewPlaylist, navigate, t]
  );

  const [pinnedTools, setPinnedTools] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('nora:playlists-pinned-tools');
      return saved ? JSON.parse(saved) : { checkMissing: false, convertSpotify: false };
    } catch {
      return { checkMissing: false, convertSpotify: false };
    }
  });

  const menuCoordsRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const openToolsContextMenu = useCallback(
    (clientX: number, clientY: number, activePinned = pinnedTools) => {
      menuCoordsRef.current = { x: clientX, y: clientY };

      const handleToggle = (key: 'checkMissing' | 'convertSpotify') => {
        const updated = {
          ...activePinned,
          [key]: !activePinned[key]
        };
        try {
          localStorage.setItem('nora:playlists-pinned-tools', JSON.stringify(updated));
        } catch (err) {
          console.error(err);
        }
        setPinnedTools(updated);
        openToolsContextMenu(menuCoordsRef.current.x, menuCoordsRef.current.y, updated);
      };

      updateContextMenuData(
        true,
        [
          {
            label: t('playlistsPage.checkMissingSongs', 'Check Missing Songs'),
            iconName: 'rule',
            handlerFunction: () =>
              changePromptMenuData(
                true,
                <Suspense fallback={null}>
                  <MissingSongsCheckerPrompt onClose={() => changePromptMenuData(false, <></>)} />
                </Suspense>
              )
          },
          {
            label: t('playlistsPage.convertSpotifyToM3u', 'Convert Spotify to M3U'),
            iconName: 'transform',
            handlerFunction: () =>
              changePromptMenuData(
                true,
                <Suspense fallback={null}>
                  <SpotifyToM3uConverterPrompt onClose={() => changePromptMenuData(false, <></>)} />
                </Suspense>
              )
          },
          {
            label: '',
            isContextMenuItemSeperator: true,
            handlerFunction: () => true
          },
          {
            label: t('playlistsPage.pinToToolbar', 'Pin to Toolbar'),
            iconName: 'push_pin',
            iconClassName: 'material-icons-round mr-2 opacity-70',
            handlerFunction: () => true,
            innerContextMenus: [
              {
                label: t('playlistsPage.checkMissingSongs', 'Check Missing Songs'),
                iconName: activePinned.checkMissing ? 'check_box' : 'check_box_outline_blank',
                iconClassName: `material-icons-round mr-2 ${
                  activePinned.checkMissing
                    ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                    : 'opacity-50'
                }`,
                preventClosingOnClick: true,
                handlerFunction: () => handleToggle('checkMissing')
              },
              {
                label: t('playlistsPage.convertSpotifyToM3u', 'Convert Spotify to M3U'),
                iconName: activePinned.convertSpotify ? 'check_box' : 'check_box_outline_blank',
                iconClassName: `material-icons-round mr-2 ${
                  activePinned.convertSpotify
                    ? 'text-font-color-highlight! dark:text-dark-font-color-highlight!'
                    : 'opacity-50'
                }`,
                preventClosingOnClick: true,
                handlerFunction: () => handleToggle('convertSpotify')
              }
            ]
          }
        ],
        clientX,
        clientY
      );
    },
    [updateContextMenuData, pinnedTools, changePromptMenuData, t]
  );

  const handleUnpinButtonContextMenu = useCallback(
    (e: React.MouseEvent, key: 'checkMissing' | 'convertSpotify') => {
      e.preventDefault();
      e.stopPropagation();
      updateContextMenuData(
        true,
        [
          {
            label: t('playlistsPage.unpinFromToolbar', 'Unpin from Toolbar'),
            iconName: 'push_pin',
            iconClassName:
              'material-icons-round mr-2 text-font-color-highlight! dark:text-dark-font-color-highlight!',
            handlerFunction: () => {
              const updated = { ...pinnedTools, [key]: false };
              try {
                localStorage.setItem('nora:playlists-pinned-tools', JSON.stringify(updated));
              } catch (err) {
                console.error(err);
              }
              setPinnedTools(updated);
            }
          }
        ],
        e.clientX,
        e.clientY
      );
    },
    [pinnedTools, updateContextMenuData, t]
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
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
      onContextMenu={(e) =>
        updateContextMenuData(
          true,
          [
            {
              label: t('playlistsPage.createNewPlaylist', 'New Standard Playlist'),
              handlerFunction: createNewPlaylist,
              iconName: 'queue_music'
            },
            {
              label: 'New Smart Playlist',
              iconName: 'auto_awesome',
              handlerFunction: () => navigate({ to: '/main-player/playlists/smart-editor' })
            },
            {
              label: t('playlistsPage.importPlaylists', 'Import Playlists'),
              iconName: 'publish',
              handlerFunction: () => CollectionClient.import().catch((err) => console.error(err))
            }
          ],
          e.pageX,
          e.pageY
        )
      }
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
                      const selectedPlaylistIds =
                        multipleSelectionsData.multipleSelections.map(Number);
                      changePromptMenuData(
                        true,
                        <Suspense fallback={null}>
                          <PlaylistBatchExportSettingsPrompt playlistIds={selectedPlaylistIds} />
                        </Suspense>
                      );
                    }}
                    tooltipLabel={t(
                      'playlistsPage.exportSelectedPlaylists',
                      'Export selected playlists'
                    )}
                  />
                )}
                {multipleSelectionsData.multipleSelections.length >= 2 && (
                  <Button
                    key="merge-playlists-btn"
                    label={t('playlistsPage.merge', 'Merge')}
                    className="merge-playlists-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                    iconName="call_merge"
                    clickHandler={() => {
                      const sourcePlaylistIds =
                        multipleSelectionsData.multipleSelections.map(Number);
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
                    tooltipLabel={t(
                      'playlistsPage.mergePlaylistsTitle',
                      'Merge selected playlists'
                    )}
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
              label={t('playlistsPage.importPlaylists', 'Import Playlists')}
              className="import-playlist-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName="publish"
              clickHandler={(_, setIsDisabled, setIsPending) => {
                setIsDisabled(true);
                setIsPending(true);

                return CollectionClient.import()
                  .finally(() => {
                    setIsDisabled(false);
                    setIsPending(false);
                  })
                  .catch((err) => console.error(err));
              }}
              tooltipLabel={t('playlistsPage.importPlaylists', 'Import Playlists')}
            />
            {pinnedTools.checkMissing && (
              <Button
                label="Check Missing Songs"
                className="check-missing-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName="rule"
                clickHandler={() =>
                  changePromptMenuData(
                    true,
                    <Suspense fallback={null}>
                      <MissingSongsCheckerPrompt onClose={() => changePromptMenuData(false, <></>)} />
                    </Suspense>
                  )
                }
                onContextMenu={(e) => handleUnpinButtonContextMenu(e, 'checkMissing')}
                tooltipLabel="Check missing songs from Spotify/M3U (Right-click to unpin)"
              />
            )}
            {pinnedTools.convertSpotify && (
              <Button
                label="Convert Spotify to M3U"
                className="convert-spotify-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName="transform"
                clickHandler={() =>
                  changePromptMenuData(
                    true,
                    <Suspense fallback={null}>
                      <SpotifyToM3uConverterPrompt onClose={() => changePromptMenuData(false, <></>)} />
                    </Suspense>
                  )
                }
                onContextMenu={(e) => handleUnpinButtonContextMenu(e, 'convertSpotify')}
                tooltipLabel="Convert a Spotify Playlist URL to an M3U file (Right-click to unpin)"
              />
            )}
            <Button
              label={t(`playlistsPage.addPlaylist`)}
              className="add-new-playlist-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName="add"
              clickHandler={handleAddPlaylistClick}
            />
            <Button
              className="playlist-tools-more-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
              iconName="more_vert"
              clickHandler={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                openToolsContextMenu(rect.left, rect.bottom);
              }}
              tooltipLabel="More Playlist Tools"
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
              scrollKey={scrollKey}
              itemContent={(index, playlist) => {
                return <Playlist index={index} selectAllHandler={selectAllHandler} {...playlist} />;
              }}
            />
          </div>
        )}
        {playlists.length > 0 && filteredPlaylists.length === 0 && (
          <div className="no-playlists-container text-font-color-black dark:text-font-color-white my-[10%] flex h-full w-full flex-col items-center justify-center text-center text-xl">
            <span className="material-icons-round-outlined mb-4 text-5xl">search_off</span>
            <span className="mb-2 font-medium">
              {t('playlistsPage.noMatchingPlaylistsTitle', 'No matching playlists found')}
            </span>
            <span className="text-sm opacity-75">
              {t('playlistsPage.noMatchingPlaylistsDesc', {
                keyword,
                defaultValue: `No playlists match "${keyword}"`
              })}
            </span>
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
