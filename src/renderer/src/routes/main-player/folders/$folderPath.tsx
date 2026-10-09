import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songFilterOptions, songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import SongRowSkeleton from '@renderer/components/SongsPage/SongRowSkeleton';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import {
  getSongListIdentity,
  songCacheKeys,
  songIdsVersionFromState,
  songQuery,
  type SongIdsParams
} from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store } from '@renderer/store/store';
import {
  computeFolderMetricsMap,
  getAllSongIds,
  parseFolderBreadcrumbs
} from '@renderer/utils/folderMetrics';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/folders/$folderPath')({
  validateSearch: songSearchSchema,
  loader: async ({ params }) => {
    if (typeof window === 'undefined' || !window.api?.folderData) return;
    if (params.folderPath) {
      const res = await window.api.folderData.getFolderData([params.folderPath]);
      if (res && res.length > 0 && res[0].songIds.length > 0) {
        const idsParams: SongIdsParams = {
          restrictToIds: res[0].songIds,
          sortType: 'aToZ',
          filterType: 'notSelected'
        };
        const idsData = await queryClient.fetchQuery(songQuery.ids(idsParams));
        const state = queryClient.getQueryState(songQuery.ids(idsParams).queryKey);
        const version = songIdsVersionFromState(state?.dataUpdatedAt);
        const listIdentity = getSongListIdentity(idsParams);
        await queryClient.ensureQueryData({
          queryKey: songCacheKeys.window(listIdentity, version, 0),
          queryFn: () =>
            window.api.audioLibraryControls.getSongInfo(
              idsData.ids.slice(0, Math.min(200, idsData.ids.length)),
              undefined,
              undefined,
              undefined,
              true
            ),
          staleTime: 5 * 60 * 1000
        });
      }
    }
  },
  component: MusicFolderInfoPage
});

function MusicFolderInfoPage() {
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { createQueue, toggleMultipleSelections, updateContextMenuData, updateQueueData } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { folderPath } = Route.useParams();
  const { filteringOrder = 'notSelected', sortingOrder = 'aToZ' } = Route.useSearch();

  const scrollKey = useMemo(
    () => `folder-songs:${folderPath}:${sortingOrder}:${filteringOrder}`,
    [folderPath, sortingOrder, filteringOrder]
  );

  const [folderInfo, setFolderInfo] = useState<MusicFolder>();

  const { folderName } = useMemo(() => {
    if (folderInfo) {
      const { path } = folderInfo;
      const name = path.split(/[\\/]/).pop() || path;

      return { folderPath: path, folderName: name };
    }
    return { folderPath: undefined, folderName: undefined };
  }, [folderInfo]);

  const breadcrumbs = useMemo(() => parseFolderBreadcrumbs(folderPath), [folderPath]);

  const metricsMap = useMemo(
    () => (folderInfo ? computeFolderMetricsMap([folderInfo]) : new Map()),
    [folderInfo]
  );

  const currentMetrics = useMemo(
    () => (folderInfo ? metricsMap.get(folderInfo.path) : undefined),
    [folderInfo, metricsMap]
  );

  const subFolders = useMemo(() => folderInfo?.subFolders || [], [folderInfo]);

  const folderSongIds = useMemo(() => folderInfo?.songIds ?? [], [folderInfo?.songIds]);

  const folderSongIdsParams: SongIdsParams = useMemo(
    () => ({
      restrictToIds: folderSongIds,
      sortType: sortingOrder,
      filterType: filteringOrder
    }),
    [folderSongIds, sortingOrder, filteringOrder]
  );

  const idsQuery = useQuery({
    ...songQuery.ids(folderSongIdsParams),
    enabled: folderSongIds.length > 0
  });

  const filteredFolderSongIds = idsQuery.data?.ids ?? [];
  const idsVersion = songIdsVersionFromState(idsQuery.dataUpdatedAt);
  const listIdentity = useMemo(
    () => getSongListIdentity(folderSongIdsParams),
    [folderSongIdsParams]
  );

  const blacklistedSet = useMemo(
    () => new Set(idsQuery.data?.blacklistedIds ?? []),
    [idsQuery.data?.blacklistedIds]
  );

  const playableSongIds = useMemo(
    () => filteredFolderSongIds.filter((id) => !blacklistedSet.has(id)),
    [filteredFolderSongIds, blacklistedSet]
  );

  const { getItem, onRangeChange } = useWindowHydration(filteredFolderSongIds, idsVersion, {
    listIdentity,
    isCompactView: preferences.isCompactSongView,
    rowHeight: 60
  });

  const totalSongsDisplay = currentMetrics?.totalSongCount ?? filteredFolderSongIds.length;
  const directSongsDisplay = currentMetrics?.directSongCount ?? filteredFolderSongIds.length;
  const subFoldersDisplay = currentMetrics?.directFolderCount ?? subFolders.length;
  const hasPlayableSongs = totalSongsDisplay > 0;

  const fetchFolderInfo = useCallback(() => {
    if (folderPath) {
      window.api.folderData
        .getFolderData([folderPath])
        .then((res) => {
          if (res && res.length > 0) return setFolderInfo(res[0]);
          return undefined;
        })
        .catch((err) => console.error(err));
    }
    return undefined;
  }, [folderPath]);

  useEffect(() => {
    fetchFolderInfo();
    const manageFolderInfoUpdatesInMusicFolderInfoPage = (e: Event) => {
      if ('detail' in e) {
        const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
        for (let i = 0; i < dataEvents.length; i += 1) {
          const event = dataEvents[i];
          if (event.dataType === 'userData/musicFolder') fetchFolderInfo();
        }
      }
    };
    document.addEventListener('app/dataUpdates', manageFolderInfoUpdatesInMusicFolderInfoPage);
    return () => {
      document.removeEventListener('app/dataUpdates', manageFolderInfoUpdatesInMusicFolderInfoPage);
    };
  }, [fetchFolderInfo]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('songsPage', sortingOrder);
  }, [sortingOrder]);

  const selectAllHandler = useSelectAllHandler(playableSongIds, 'songs');

  const handleSongPlayBtnClick = useCallback(
    (currSongId?: number, shuffleQueue = false, startPlaying = false) => {
      createQueue(playableSongIds, 'folder', shuffleQueue, folderInfo?.path, startPlaying, folderName);

      if (currSongId) updateQueueData(playableSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, folderInfo?.path, folderName, playableSongIds]
  );

  const handlePlayAllBranch = useCallback(
    (shuffleQueue = false) => {
      if (!folderInfo) return;
      const songIds = getAllSongIds(folderInfo);
      if (songIds.length === 0) return;
      createQueue(songIds, 'folder', shuffleQueue, folderInfo.path, true, folderName);
    },
    [createQueue, folderInfo, folderName]
  );

  const otherOptions = useMemo(
    () => [
      {
        label: t('settingsPage.resyncLibrary'),
        iconName: 'sync',
        handlerFunction: () => window.api.audioLibraryControls.resyncSongsLibrary()
      }
    ],
    [t]
  );

  return (
    <MainContainer
      className="appear-from-bottom flex h-full! flex-col pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      <>
        {/* Breadcrumb Navigation */}
        <div className="breadcrumbs-container text-font-color-black/70 dark:text-font-color-white/70 mb-2 flex flex-wrap items-center text-xs">
          <button
            type="button"
            className="hover:text-font-color-highlight dark:hover:text-dark-font-color-highlight flex cursor-pointer items-center transition-colors"
            onClick={() => navigate({ to: '/main-player/folders' })}
          >
            <span className="material-icons-round-outlined mr-1 text-base">folder</span>
            {t('foldersPage.musicFolders')}
          </button>
          {breadcrumbs.map((crumb) => (
            <div key={crumb.path} className="flex items-center">
              <span className="mx-2 opacity-50">&gt;</span>
              {crumb.isCurrent ? (
                <span className="text-font-color-black dark:text-font-color-white font-semibold">
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  className="hover:text-font-color-highlight dark:hover:text-dark-font-color-highlight cursor-pointer transition-colors"
                  onClick={() =>
                    navigate({
                      to: '/main-player/folders/$folderPath',
                      params: { folderPath: crumb.path }
                    })
                  }
                >
                  {crumb.label}
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Title and Controls Header */}
        <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-1 mb-6 flex flex-wrap items-center justify-between gap-4 pr-4 text-3xl font-medium">
          <div className="container flex flex-wrap items-baseline">
            <span>'{folderName}'</span>
            <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-6 flex flex-wrap items-center text-xs">
              {isMultipleSelectionEnabled ? (
                <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {t('common.selectionWithCount', {
                    count: multipleSelectionsData.multipleSelections.length
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  {subFoldersDisplay > 0 && (
                    <span>{t('common.subFolderWithCount', { count: subFoldersDisplay })}</span>
                  )}
                  {subFoldersDisplay > 0 && <span>&bull;</span>}
                  <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-medium">
                    {t('common.songWithCount', { count: totalSongsDisplay })}
                  </span>
                  {subFoldersDisplay > 0 && directSongsDisplay > 0 && (
                    <span className="opacity-75">({directSongsDisplay} direct)</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {folderInfo && (
            <div className="buttons-container flex items-center text-sm">
              <Button
                key={0}
                className="more-options-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName="more_horiz"
                clickHandler={(e) => {
                  e.stopPropagation();
                  const button = e.currentTarget;
                  const { x, y } = button.getBoundingClientRect();
                  updateContextMenuData(true, otherOptions, x + 10, y + 50);
                }}
                tooltipLabel={t('common.moreOptions')}
                onContextMenu={(e) => {
                  e.preventDefault();
                  updateContextMenuData(true, otherOptions, e.pageX, e.pageY);
                }}
              />
              {isMultipleSelectionEnabled && multipleSelectionsData.selectionType === 'songs' && (
                <Button
                  key="select-all-btn"
                  className="select-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                  iconName="select_all"
                  clickHandler={() => selectAllHandler()}
                  tooltipLabel={t('common.selectAll')}
                />
              )}
              {filteredFolderSongIds.length > 0 && (
                <Button
                  key={1}
                  className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                  iconName={isMultipleSelectionEnabled ? 'remove_done' : 'checklist'}
                  clickHandler={() =>
                    toggleMultipleSelections(!isMultipleSelectionEnabled, 'songs')
                  }
                  tooltipLabel={t(
                    `common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`
                  )}
                />
              )}
              {hasPlayableSongs && (
                <>
                  <Button
                    key={2}
                    tooltipLabel={t('common.playAll')}
                    className="play-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                    iconName="play_arrow"
                    clickHandler={() => handlePlayAllBranch(false)}
                  />
                  <Button
                    key={3}
                    tooltipLabel={t('common.shuffleAndPlay')}
                    className="shuffle-and-play-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                    iconName="shuffle"
                    clickHandler={() => handlePlayAllBranch(true)}
                  />
                </>
              )}
              {filteredFolderSongIds.length > 0 && (
                <>
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
                    name="musicFolderSortDropdown"
                    type={`${t('common.sortBy')} :`}
                    value={sortingOrder ?? ''}
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
                </>
              )}
            </div>
          )}
        </div>

        {/* Sub-Folders Section */}
        {subFolders.length > 0 && (
          <div className="sub-folders-section mb-6">
            <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-3 flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
              <span>
                {t('foldersPage.subFolders', { defaultValue: 'Sub-folders' })} ({subFolders.length})
              </span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {subFolders.map((sub) => {
                const subMetrics = metricsMap.get(sub.path);
                const subTotalSongs = subMetrics?.totalSongCount ?? sub.songIds.length;
                const subDirectFolders = subMetrics?.directFolderCount ?? sub.subFolders.length;
                const subName = sub.path.split(/[\\/]/).pop() || sub.path;

                return (
                  <div
                    key={sub.path}
                    tabIndex={0}
                    role="button"
                    onClick={() => {
                      navigate({
                        to: '/main-player/folders/$folderPath',
                        params: { folderPath: sub.path }
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate({
                          to: '/main-player/folders/$folderPath',
                          params: { folderPath: sub.path }
                        });
                      }
                    }}
                    className="bg-background-color-2/70 hover:bg-background-color-2 dark:bg-dark-background-color-2/50 dark:hover:bg-dark-background-color-2 group flex cursor-pointer items-center justify-between rounded-lg p-3 transition-colors focus-visible:!outline"
                  >
                    <div className="flex min-w-0 items-center">
                      <span className="material-icons-round-outlined text-font-color-highlight dark:text-dark-font-color-highlight mr-3 text-2xl">
                        folder
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span
                          className="text-font-color-black dark:text-font-color-white truncate text-sm font-medium"
                          title={subName}
                        >
                          {subName}
                        </span>
                        <div className="flex items-center text-xs font-thin opacity-75">
                          {subDirectFolders > 0 && (
                            <>
                              <span>
                                {subDirectFolders}{' '}
                                {subDirectFolders === 1 ? 'subfolder' : 'subfolders'}
                              </span>
                              <span className="mx-1">&bull;</span>
                            </>
                          )}
                          <span>{t('common.songWithCount', { count: subTotalSongs })}</span>
                        </div>
                      </div>
                    </div>
                    <span className="material-icons-round-outlined text-font-color-black/40 dark:text-font-color-white/40 group-hover:text-font-color-highlight dark:group-hover:text-dark-font-color-highlight text-lg transition-colors">
                      chevron_right
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Direct Songs Section */}
        <div className="direct-songs-section min-h-0 flex-1 pb-2">
          {subFolders.length > 0 && filteredFolderSongIds.length > 0 && (
            <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-3 flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
              <span>
                {t('foldersPage.songsInThisFolder', { defaultValue: 'Songs in this folder' })} (
                {filteredFolderSongIds.length})
              </span>
            </div>
          )}
          {filteredFolderSongIds.length > 0 ? (
            <div className="songs-container h-full min-h-0 flex-1">
              <VirtualizedList
                data={filteredFolderSongIds}
                fixedItemHeight={60}
                scrollKey={scrollKey}
                computeItemKey={(_index, id) => id}
                onChange={onRangeChange}
                itemContent={(index) => {
                  const song = getItem(index);
                  if (song)
                    return (
                      <Song
                        key={song.songId}
                        index={index}
                        isIndexingSongs={preferences.isSongIndexingEnabled}
                        onPlayClick={handleSongPlayBtnClick}
                        selectAllHandler={selectAllHandler}
                        isCompact={preferences.isCompactSongView}
                        isDelegated={true}
                        {...song}
                      />
                    );
                  return (
                    <SongRowSkeleton
                      index={index}
                      isCompact={preferences.isCompactSongView}
                      rowSize={preferences.isCompactSongView ? 'small' : 'normal'}
                    />
                  );
                }}
              />
            </div>
          ) : (
            <div className="text-font-color-black/60 dark:text-font-color-white/60 py-6 text-center text-sm font-thin">
              {subFolders.length > 0
                ? 'No songs directly in this folder. Browse subfolders above or click Play All to play all songs.'
                : 'No songs found in this folder.'}
            </div>
          )}
        </div>
      </>
    </MainContainer>
  );
}

export default MusicFolderInfoPage;
