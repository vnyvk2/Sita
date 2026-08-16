import NoFoldersImage from '@assets/images/svg/Empty Inbox _Monochromatic.svg';
import Button from '@renderer/components/Button';
import Dropdown from '@renderer/components/Dropdown';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import Folder from '@renderer/components/MusicFoldersPage/Folder';
import { folderDropdownOptions } from '@renderer/components/MusicFoldersPage/folderOptions';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { store } from '@renderer/store/store';
import flattenVisibleFolders from '@renderer/utils/flattenVisibleFolders';
import { computeFolderMetricsMap } from '@renderer/utils/folderMetrics';
import storage from '@renderer/utils/localStorage';
import { folderSearchSchema } from '@renderer/utils/zod/folderSchema';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { lazy, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/main-player/folders/')({
  validateSearch: folderSearchSchema,
  component: MusicFoldersPage
});

const AddMusicFoldersPrompt = lazy(
  () => import('@renderer/components/MusicFoldersPage/AddMusicFoldersPrompt')
);

function MusicFoldersPage() {
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const musicFoldersPageSortingState = useStore(
    store,
    (state) => state.localStorage.sortingStates.musicFoldersPage
  );

  const { toggleMultipleSelections, changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate({ from: Route.fullPath });
  const { sortingOrder = musicFoldersPageSortingState || 'aToZ' } = Route.useSearch();

  const [musicFolders, setMusicFolders] = useState<MusicFolder[]>([]);
  const [expandedFolderPaths, setExpandedFolderPaths] = useState<Set<string>>(new Set());

  const foldersContainerRef = useRef<HTMLDivElement | null>(null);

  const fetchFoldersData = useCallback(
    () =>
      window.api.folderData
        .getFolderData([], sortingOrder)
        .then((res) => {
          if (Array.isArray(res) && res.length > 0) return setMusicFolders(res);
          return undefined;
        })
        .catch((err) => console.error(err)),
    [sortingOrder]
  );

  useEffect(() => {
    fetchFoldersData();
    const manageFolderDataUpdatesInMusicFoldersPage = (e: Event) => {
      if ('detail' in e) {
        const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
        for (let i = 0; i < dataEvents.length; i += 1) {
          const event = dataEvents[i];
          if (
            event.dataType === 'userData/musicFolder' ||
            event.dataType === 'blacklist/folderBlacklist' ||
            event.dataType === 'songs/deletedSong' ||
            event.dataType === 'songs/newSong'
          )
            fetchFoldersData();
        }
      }
    };
    document.addEventListener('app/dataUpdates', manageFolderDataUpdatesInMusicFoldersPage);
    return () => {
      document.removeEventListener('app/dataUpdates', manageFolderDataUpdatesInMusicFoldersPage);
    };
  }, [fetchFoldersData]);

  useEffect(() => {
    storage.sortingStates.setSortingStates('musicFoldersPage', sortingOrder);
  }, [sortingOrder]);

  const handleToggleExpand = useCallback((folderPath: string) => {
    setExpandedFolderPaths((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) {
        next.delete(folderPath);
      } else {
        next.add(folderPath);
      }
      return next;
    });
  }, []);

  const musicFoldersWithPaths = useMemo(() => {
    const list: (MusicFolder & { folderPath: string })[] = [];
    const traverse = (folders: MusicFolder[]) => {
      for (let i = 0; i < folders.length; i++) {
        list.push({ ...folders[i], folderPath: folders[i].path });
        if (folders[i].subFolders.length > 0) {
          traverse(folders[i].subFolders);
        }
      }
    };
    traverse(musicFolders);
    return list;
  }, [musicFolders]);

  const selectAllHandler = useSelectAllHandler(musicFoldersWithPaths, 'folder', 'folderPath');

  const metricsMap = useMemo(() => computeFolderMetricsMap(musicFolders), [musicFolders]);

  const { totalLibraryFolders, totalLibrarySongs } = useMemo(() => {
    let totalFolders = musicFolders.length;
    let totalSongs = 0;
    for (let i = 0; i < musicFolders.length; i++) {
      const metrics = metricsMap.get(musicFolders[i].path);
      if (metrics) {
        totalFolders += metrics.totalFolderCount;
        totalSongs += metrics.totalSongCount;
      }
    }
    return { totalLibraryFolders: totalFolders, totalLibrarySongs: totalSongs };
  }, [metricsMap, musicFolders]);

  const visibleFolders = useMemo(
    () => flattenVisibleFolders(musicFolders, expandedFolderPaths),
    [musicFolders, expandedFolderPaths]
  );

  const addNewFolder = useCallback(() => {
    changePromptMenuData(true, <AddMusicFoldersPrompt onFailure={(err) => console.error(err)} />);
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

  const resyncLibrary = useCallback(
    (
      _: unknown,
      setIsDisabled: (state: boolean) => void,
      setIsPending: (state: boolean) => void
    ) => {
      setIsDisabled(true);
      setIsPending(true);

      return window.api.audioLibraryControls
        .resyncSongsLibrary()
        .finally(() => {
          setIsDisabled(false);
          setIsPending(false);
        })
        .catch((err) => console.error(err));
    },
    []
  );

  return (
    <MainContainer
      className="music-folders-page appear-from-bottom relative h-full! pr-4! pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      <>
        {musicFolders && musicFolders.length > 0 && (
          <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-2 mb-8 flex items-center justify-between text-3xl font-medium">
            <div className="container flex items-baseline">
              {t('foldersPage.musicFolders')}
              <div className="other-stats-container text-font-color-black dark:text-font-color-white ml-12 flex items-center text-xs">
                {isMultipleSelectionEnabled ? (
                  <div className="text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                    {t('common.selectionWithCount', {
                      count: multipleSelectionsData.multipleSelections.length
                    })}
                  </div>
                ) : (
                  musicFolders.length > 0 && (
                    <span className="no-of-folders flex items-center">
                      <span>{t('common.folderWithCount', { count: totalLibraryFolders })}</span>
                      <span className="mx-2">&bull;</span>
                      <span className="text-font-color-highlight dark:text-dark-font-color-highlight font-medium">
                        {t('common.songWithCount', { count: totalLibrarySongs })}
                      </span>
                    </span>
                  )
                )}
              </div>
            </div>
            {musicFolders.length > 0 && (
              <div className="other-controls-container flex text-sm">
                {isMultipleSelectionEnabled &&
                  multipleSelectionsData.selectionType === 'folder' && (
                    <Button
                      key="select-all-btn"
                      className="select-all-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                      iconName="select_all"
                      clickHandler={() => selectAllHandler()}
                      tooltipLabel={t('common.selectAll')}
                    />
                  )}
                <Button
                  className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                  iconName={isMultipleSelectionEnabled ? 'remove_done' : 'checklist'}
                  clickHandler={() =>
                    toggleMultipleSelections(!isMultipleSelectionEnabled, 'folder')
                  }
                  tooltipLabel={t(
                    `common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`
                  )}
                />
                <Button
                  label={t('settingsPage.resyncLibrary')}
                  iconName="sync"
                  pendingAnimationOnDisabled
                  iconClassName="material-icons-round-outlined"
                  clickHandler={resyncLibrary}
                />
                <Button
                  label={t('foldersPage.addFolder')}
                  iconName="create_new_folder"
                  pendingAnimationOnDisabled
                  iconClassName="material-icons-round-outlined"
                  clickHandler={addNewFolder}
                />
                <Dropdown
                  name="folderSortDropdown"
                  value={sortingOrder}
                  options={folderDropdownOptions}
                  onChange={(e) => {
                    const order = e.target.value as FolderSortTypes;
                    storage.sortingStates.setSortingStates('musicFoldersPage', order);
                    navigate({ search: (prev) => ({ ...prev, sortingOrder: order }) });
                  }}
                />
              </div>
            )}
          </div>
        )}

        <div
          className={`folders-container [scrollbar-gutter:stable] ${
            musicFolders && musicFolders.length > 0 ? 'h-full' : ''
          }`}
          ref={foldersContainerRef}
        >
          {visibleFolders.length > 0 && (
            <VirtualizedList
              data={visibleFolders}
              fixedItemHeight={60}
              scrollKey="musicFoldersPage"
              itemContent={(index, item) => {
                const { folder, depth, isExpanded, hasChildren } = item;
                return (
                  <Folder
                    key={folder.path}
                    folderPath={folder.path}
                    subFolders={folder.subFolders}
                    hasChildren={hasChildren}
                    metrics={metricsMap.get(folder.path)}
                    index={index}
                    depth={depth}
                    isExpanded={isExpanded}
                    onToggleExpand={handleToggleExpand}
                    isBlacklisted={folder.isBlacklisted}
                    songIds={folder.songIds}
                    selectAllHandler={selectAllHandler}
                  />
                );
              }}
            />
          )}
        </div>

        {musicFolders.length === 0 && (
          <div className="no-folders-container text-font-color-black dark:text-font-color-white flex h-full flex-col items-center justify-center text-lg">
            <Img src={NoFoldersImage} className="w-60" />
            <br />
            <p> {t('foldersPage.empty')}</p>

            <div className="flex items-center justify-between">
              <Button
                label={t('foldersPage.addFolder')}
                className="bg-background-color-3! text-font-color-black! hover:border-background-color-3 dark:bg-dark-background-color-3! dark:text-font-color-black dark:hover:border-background-color-3 mt-4 px-8 text-lg"
                iconName="create_new_folder"
                pendingAnimationOnDisabled
                iconClassName="material-icons-round-outlined"
                clickHandler={addNewFolder}
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
      </>
    </MainContainer>
  );
}
