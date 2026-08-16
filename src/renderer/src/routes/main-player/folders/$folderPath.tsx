import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import MainContainer from '@renderer/components/MainContainer';
import Song from '@renderer/components/SongsPage/Song';
import { songFilterOptions, songSortOptions } from '@renderer/components/SongsPage/SongOptions';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { store } from '@renderer/store/store';
import {
  computeFolderMetricsMap,
  getAllSongIds,
  parseFolderBreadcrumbs
} from '@renderer/utils/folderMetrics';
import storage from '@renderer/utils/localStorage';
import { songSearchSchema } from '@renderer/utils/zod/songSchema';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/folders/$folderPath')({
  validateSearch: songSearchSchema,
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
  const [folderSongs, setFolderSongs] = useState<SongData[]>([]);

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

  const allBranchSongIds = useMemo(
    () => (folderInfo ? getAllSongIds(folderInfo) : []),
    [folderInfo]
  );

  const subFolders = useMemo(() => folderInfo?.subFolders || [], [folderInfo]);

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

  const fetchFolderSongs = useCallback(() => {
    if (folderInfo && folderInfo.songIds.length > 0) {
      window.api.audioLibraryControls
        .getSongInfo(folderInfo.songIds, sortingOrder, filteringOrder)
        .then((res) => {
          if (res && res.length > 0) return setFolderSongs(res);
          return undefined;
        })
        .catch((err) => console.error(err));
    }
    return setFolderSongs([]);
  }, [filteringOrder, folderInfo, sortingOrder]);

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
    fetchFolderSongs();
    const manageSongUpdatesInMusicFolderInfoPage = (e: Event) => {
      if ('detail' in e) {
        const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
        for (let i = 0; i < dataEvents.length; i += 1) {
          const event = dataEvents[i];
          if (
            event.dataType === 'songs/artworks' ||
            event.dataType === 'songs/deletedSong' ||
            event.dataType === 'songs/newSong' ||
            event.dataType === 'songs/updatedSong' ||
            (event.dataType === 'songs/likes' && event.eventData.length > 1)
          )
            fetchFolderSongs();
        }
      }
    };
    document.addEventListener('app/dataUpdates', manageSongUpdatesInMusicFolderInfoPage);
    return () => {
      document.removeEventListener('app/dataUpdates', manageSongUpdatesInMusicFolderInfoPage);
    };
  }, [fetchFolderSongs]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('songsPage', sortingOrder);
  }, [sortingOrder]);

  const selectAllHandler = useSelectAllHandler(folderSongs, 'songs', 'songId');

  const handleSongPlayBtnClick = useCallback(
    (currSongId?: number, shuffleQueue = false, startPlaying = false) => {
      const queueSongIds = folderSongs
        .filter((song) => !song.isBlacklisted)
        .map((song) => song.songId);
      createQueue(queueSongIds, 'folder', shuffleQueue, folderInfo?.path, startPlaying, folderName);

      if (currSongId) updateQueueData(queueSongIds.indexOf(currSongId), undefined, false, true);
    },
    [createQueue, updateQueueData, folderInfo?.path, folderName, folderSongs]
  );

  const handlePlayAllBranch = useCallback(
    (shuffleQueue = false) => {
      if (allBranchSongIds.length === 0) return;
      createQueue(allBranchSongIds, 'folder', shuffleQueue, folderInfo?.path, true, folderName);
    },
    [allBranchSongIds, createQueue, folderInfo?.path, folderName]
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

  const totalSongsDisplay = currentMetrics?.totalSongCount ?? folderSongs.length;
  const directSongsDisplay = currentMetrics?.directSongCount ?? folderSongs.length;
  const subFoldersDisplay = currentMetrics?.directFolderCount ?? subFolders.length;

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
        {/* Breadcrumbs Navigation Bar */}
        <div className="breadcrumbs-container text-font-color-highlight/80 dark:text-dark-font-color-highlight/80 mt-1 mb-3 flex flex-wrap items-center text-sm font-normal">
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
              {folderSongs.length > 0 && (
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
              {allBranchSongIds.length > 0 && (
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
              {folderSongs.length > 0 && (
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

        {/* Subfolders Section */}
        {subFolders.length > 0 && (
          <div className="subfolders-section mb-6">
            <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-3 flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
              <span>{t('common.subFolderWithCount', { count: subFolders.length })}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {subFolders.map((sub) => {
                const subMetrics = metricsMap.get(sub.path);
                const subTotalSongs = subMetrics?.totalSongCount ?? sub.songIds.length;
                const subDirectFolders = sub.subFolders?.length ?? 0;
                const subName = sub.path.split(/[\\/]/).pop() || sub.path;

                return (
                  <div
                    key={sub.path}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      navigate({
                        to: '/main-player/folders/$folderPath',
                        params: { folderPath: sub.path }
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
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
                        <span className="text-xs font-thin opacity-75">
                          {subDirectFolders > 0
                            ? `${subDirectFolders} ${subDirectFolders === 1 ? 'subfolder' : 'subfolders'} • ${subTotalSongs} songs`
                            : `${subTotalSongs} songs`}
                        </span>
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
          {subFolders.length > 0 && folderSongs.length > 0 && (
            <div className="text-font-color-highlight dark:text-dark-font-color-highlight mb-3 flex items-center justify-between text-xs font-semibold tracking-wider uppercase">
              <span>
                {t('foldersPage.songsInThisFolder', { defaultValue: 'Songs in this folder' })} (
                {folderSongs.length})
              </span>
            </div>
          )}
          {folderSongs.length > 0 ? (
            <div className="songs-container h-full min-h-0 flex-1">
              <VirtualizedList
                data={folderSongs}
                fixedItemHeight={60}
                scrollKey={scrollKey}
                itemContent={(index, song) => {
                  if (song)
                    return (
                      <Song
                        key={index}
                        index={index}
                        isIndexingSongs={preferences.isSongIndexingEnabled}
                        onPlayClick={handleSongPlayBtnClick}
                        selectAllHandler={selectAllHandler}
                        {...song}
                      />
                    );
                  return <div>Bad Index</div>;
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
