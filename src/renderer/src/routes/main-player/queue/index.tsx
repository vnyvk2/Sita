import { Droppable, DragDropContext, type DropResult } from '@hello-pangea/dnd';
// import DefaultSongCover from '@renderer/assets/images/webp/song_cover_default.webp';
// import DefaultPlaylistCover from '@renderer/assets/images/webp/playlist_cover_default.webp';
// import FolderImg from '@renderer/assets/images/webp/empty-folder.webp';
import NoSongsImage from '@renderer/assets/images/svg/Sun_Monochromatic.svg';
import Button from '@renderer/components/Button';
import Img from '@renderer/components/Img';
import MainContainer from '@renderer/components/MainContainer';
import QueueTabs from '@renderer/components/QueueTabs';
import QueueRow from '@renderer/components/SongsPage/QueueRow';
import VirtualizedList from '@renderer/components/VirtualizedList';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSelectAllHandler from '@renderer/hooks/useSelectAllHandler';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { queueQuery } from '@renderer/queries/queue';
import { songQuery } from '@renderer/queries/songs';
import { queryClient } from '@renderer/queryClient';
import { store, dispatch } from '@renderer/store/store';
import calculateTimeFromSeconds from '@renderer/utils/calculateTimeFromSeconds';
import { baseInfoPageSearchParamsSchema } from '@renderer/utils/zod/baseInfoPageSearchParamsSchema';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { useTranslation } from 'react-i18next';
import { type VirtuosoHandle } from 'react-virtuoso';
import { z } from 'zod';

const queuePageSearchParamsSchema = baseInfoPageSearchParamsSchema.extend({
  queueIndex: z.coerce.number().optional()
});

export const Route = createFileRoute('/main-player/queue/')({
  component: RouteComponent,
  validateSearch: queuePageSearchParamsSchema
});

function RouteComponent() {
  const navigate = useNavigate({ from: Route.fullPath });
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isMultipleSelectionEnabled = useStore(
    store,
    (state) => state.multipleSelectionsData.isEnabled
  );
  const multipleSelectionsData = useStore(store, (state) => state.multipleSelectionsData);
  const queue = useStore(store, (state) => state.localStorage.queue);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const manager = getQueuesManager();

  const { queueIndex } = Route.useSearch();
  const [viewingQueueIndex, setViewingQueueIndex] = useState(queueIndex ?? queue.currentQueueIndex);

  const scrollKey = useMemo(() => `queue-list:${viewingQueueIndex}`, [viewingQueueIndex]);

  // Sync viewingQueueIndex if active queue is deleted or changed externally
  const prevActiveQueueRef = useRef(queue.currentQueueIndex);

  useEffect(() => {
    if (queueIndex !== undefined && queueIndex < queue.queues.length) {
      setViewingQueueIndex(queueIndex);
    } else if (prevActiveQueueRef.current !== queue.currentQueueIndex) {
      setViewingQueueIndex(queue.currentQueueIndex);
      prevActiveQueueRef.current = queue.currentQueueIndex;
    } else if (viewingQueueIndex >= queue.queues.length) {
      setViewingQueueIndex(Math.max(0, queue.queues.length - 1));
    }
  }, [queueIndex, queue.currentQueueIndex, queue.queues.length, viewingQueueIndex]);

  const songIdsRef = useRef<number[]>([]);
  const currentQueue = useMemo(() => {
    const nextIds = queue.queues[viewingQueueIndex]?.songIds;
    if (!nextIds || nextIds.length === 0) {
      if (songIdsRef.current.length === 0) return songIdsRef.current;
      songIdsRef.current = [];
      return songIdsRef.current;
    }
    const prevIds = songIdsRef.current;
    if (prevIds.length === nextIds.length) {
      let isSame = true;
      for (let i = 0; i < nextIds.length; i++) {
        if (prevIds[i] !== nextIds[i]) {
          isSame = false;
          break;
        }
      }
      if (isSame) {
        return prevIds;
      }
    }
    songIdsRef.current = nextIds;
    return nextIds;
  }, [queue.queues, viewingQueueIndex]);

  const { addNewNotifications, updateContextMenuData, toggleMultipleSelections, playSong } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();

  const viewingQueue = manager?.queues?.[viewingQueueIndex];
  const queueId = viewingQueue?.id ?? queue.queues[viewingQueueIndex]?.id ?? 'active';
  const membershipVersion = viewingQueue?.membershipVersion ?? 0;

  const { data: queuedSongs } = useQuery({
    ...songQuery.queue({
      songIds: currentQueue,
      queueId,
      membershipVersion
    }),
    enabled: currentQueue.length > 0
  });

  const queuedSongsMap = useMemo(() => {
    if (!queuedSongs || queuedSongs.length === 0) return new Map<number, SongData>();
    return new Map(queuedSongs.map((s) => [s.songId, s]));
  }, [queuedSongs]);

  const { data: queueInfo } = useQuery({
    ...queueQuery.info({
      queueType: queue.queues[viewingQueueIndex]?.metadata?.queueType ?? 'songs',
      id: queue.queues[viewingQueueIndex]?.metadata?.queueId ?? ''
    }),
    select: (data): QueueInfo | undefined => {
      if (data) {
        if (queue.queues[viewingQueueIndex]?.metadata?.queueType === 'songs')
          return { artworkPath: currentSongData.artworkPath!, title: 'All Songs' };
        if (queue.queues[viewingQueueIndex]?.metadata?.queueType === 'folder')
          return {
            ...data,
            title: t(data.title ? 'currentQueuePage.folderWithName' : 'common.unknownFolder', {
              name: data.title
            })
          };
        if (queue.queues[viewingQueueIndex]?.metadata?.queueType === undefined)
          return {
            artworkPath: '',
            title:
              queue.queues[viewingQueueIndex]?.metadata?.title || `Queue ${viewingQueueIndex + 1}`
          };
        return data;
      }
      return undefined;
    }
  });
  const [isAutoScrolling, setIsAutoScrolling] = useState(false);

  const ListRef = useRef<VirtuosoHandle>(null);

  // const isTheSameQueue = useCallback((newQueueSongIds: string[]) => {
  //   const prevQueueSongIds = previousQueueRef.current;
  //   const isSameQueue = prevQueueSongIds.every((id) => newQueueSongIds.includes(id));

  //   return isSameQueue;
  // }, []);

  // const fetchAllSongsData = useCallback(() => {
  //   window.api.audioLibraryControls
  //     .getSongInfo(currentQueue, 'addedOrder', undefined, undefined, true)
  //     .then((res) => {
  //       if (res) {
  //         setQueuedSongs(res);
  //         previousQueueRef.current = currentQueue.slice();
  //       }
  //     });
  // }, [currentQueue]);

  // useEffect(() => {
  //   fetchAllSongsData();
  //   const manageSongUpdatesInCurrentQueue = (e: Event) => {
  //     if ('detail' in e) {
  //       const dataEvents = (e as DetailAvailableEvent<DataUpdateEvent[]>).detail;
  //       for (let i = 0; i < dataEvents.length; i += 1) {
  //         const event = dataEvents[i];
  //         if (
  //           event.dataType.includes('songs') ||
  //           event.dataType === 'userData/queue' ||
  //           event.dataType === 'blacklist/songBlacklist' ||
  //           event.dataType === 'songs/likes'
  //         )
  //           fetchAllSongsData();
  //       }
  //     }
  //   };
  //   document.addEventListener('app/dataUpdates', manageSongUpdatesInCurrentQueue);
  //   return () => {
  //     document.removeEventListener('app/dataUpdates', manageSongUpdatesInCurrentQueue);
  //   };
  // }, [fetchAllSongsData]);

  const selectAllHandler = useSelectAllHandler(queuedSongs || [], 'songs', 'songId');

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return undefined;

    // Directly manipulate PlayerQueue instead of creating a new array
    const updatedQueue = Array.from(currentQueue);
    const [item] = updatedQueue.splice(result.source.index, 1);
    updatedQueue.splice(result.destination.index, 0, item);

    // Update the currently viewed queue
    const queueToUpdate = manager.queues[viewingQueueIndex];
    let newPosition = queueToUpdate.position;

    if (result.source.index === newPosition) {
      newPosition = result.destination.index;
    } else if (result.source.index < newPosition && result.destination.index >= newPosition) {
      newPosition -= 1;
    } else if (result.source.index > newPosition && result.destination.index <= newPosition) {
      newPosition += 1;
    }

    queueToUpdate.replaceQueue(updatedQueue, newPosition, false);
    dispatch({
      type: 'UPDATE_QUEUE',
      data: {
        queues: manager.queues.map((q) => q.toJSON()),
        currentQueueIndex: manager.activeQueueIndex
      }
    });
    return undefined;
  };

  const centerCurrentlyPlayingSong = useCallback(() => {
    const index = currentQueue.indexOf(currentSongData.songId);
    if (ListRef && index >= 0) ListRef.current?.scrollToIndex({ index, align: 'center' });
  }, [currentSongData.songId, currentQueue]);

  useEffect(() => {
    const timeOutId = setTimeout(() => centerCurrentlyPlayingSong(), 1000);

    return () => {
      if (timeOutId) clearTimeout(timeOutId);
    };
  }, [centerCurrentlyPlayingSong, isAutoScrolling]);

  const moreOptionsContextMenuItems = useMemo(
    () => [
      {
        label: t('currentQueuePage.scrollToCurrentPlayingSong'),
        iconName: 'vertical_align_center',
        handlerFunction: centerCurrentlyPlayingSong
      }
    ],
    [centerCurrentlyPlayingSong, t]
  );

  // Precomputed suffix sum array and total duration in a single backward pass
  const { suffixDurations, queueDuration } = useMemo(() => {
    if (currentQueue.length === 0 || queuedSongsMap.size === 0) {
      return { suffixDurations: null, queueDuration: '0:00' };
    }
    const len = currentQueue.length;
    const suffix = new Float64Array(len);
    let running = 0;
    for (let i = len - 1; i >= 0; i--) {
      const song = queuedSongsMap.get(currentQueue[i]);
      if (song) {
        running += song.duration;
      }
      suffix[i] = running;
    }
    return {
      suffixDurations: suffix,
      queueDuration: calculateTimeFromSeconds(running).timeString
    };
  }, [currentQueue, queuedSongsMap]);

  const activeQueuePosition = queue.queues[queue.currentQueueIndex]?.position ?? 0;
  const completedQueueDuration = useMemo(() => {
    if (!suffixDurations || suffixDurations.length === 0) return '0:00';
    const pos = Math.max(0, Math.min(activeQueuePosition, suffixDurations.length - 1));
    const remaining = suffixDurations[pos] ?? 0;
    return calculateTimeFromSeconds(remaining).timeString;
  }, [activeQueuePosition, suffixDurations]);

  const multipleSelectionsDataRef = useRef(multipleSelectionsData);
  multipleSelectionsDataRef.current = multipleSelectionsData;

  const currentQueueRef = useRef(currentQueue);
  currentQueueRef.current = currentQueue;

  const handlePlaySong = useCallback(
    (index: number, songId: number) => {
      const queueToPlay = manager.queues[viewingQueueIndex];
      if (queueToPlay) {
        queueToPlay.moveToPosition(index);
        if (viewingQueueIndex !== manager.activeQueueIndex) {
          manager.switchQueue(viewingQueueIndex);
        } else {
          playSong(songId, true);
        }
      }
    },
    [manager, viewingQueueIndex, playSong]
  );

  const handleRemoveSong = useCallback(
    (songId: number) => {
      const { multipleSelections: selectedSongIds, selectionType, isEnabled } =
        multipleSelectionsDataRef.current;
      const isMultipleSelectionsEnabled =
        isEnabled && selectionType === 'songs' && selectedSongIds.length !== 1;

      const queueToUpdate = manager.queues[viewingQueueIndex];
      if (queueToUpdate) {
        if (isMultipleSelectionsEnabled) {
          queueToUpdate.removeSongIds(selectedSongIds);
          toggleMultipleSelections(false);
        } else {
          queueToUpdate.removeSongId(songId);
        }
      }
    },
    [manager, toggleMultipleSelections, viewingQueueIndex]
  );

  return (
    <MainContainer
      className="current-queue-container appear-from-bottom relative h-full! overflow-hidden pb-0!"
      focusable
      onKeyDown={(e) => {
        if (e.ctrlKey && e.key === 'a') {
          e.stopPropagation();
          selectAllHandler();
        }
      }}
    >
      {queueInfo && (
        <>
          <div className="mt-1 mb-2 w-full pr-4">
            <QueueTabs
              viewingQueueIndex={viewingQueueIndex}
              setViewingQueueIndex={setViewingQueueIndex}
            />
          </div>
          <div className="title-container text-font-color-highlight dark:text-dark-font-color-highlight mt-2 mb-4 flex items-center justify-between pr-4 text-3xl font-medium">
            <div className="flex items-center gap-4">
              {queue.queues[viewingQueueIndex]?.metadata?.title ||
                (queue.queues[viewingQueueIndex]?.metadata?.queueType === 'songs'
                  ? 'All Songs'
                  : `Queue ${viewingQueueIndex + 1}`)}
              {viewingQueueIndex === queue.currentQueueIndex && (
                <span
                  className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight ml-2 text-sm"
                  title="Currently Playing"
                >
                  equalizer
                </span>
              )}
              {viewingQueueIndex !== queue.currentQueueIndex && currentQueue.length > 0 && (
                <Button
                  className="bg-background-color-3 dark:bg-dark-background-color-3 !m-0 flex h-10 w-10 items-center justify-center rounded-full shadow-md transition-transform hover:scale-105"
                  iconName="play_arrow"
                  iconClassName="text-2xl text-font-color-black dark:text-font-color-black"
                  tooltipLabel={t('common.play', 'Play')}
                  clickHandler={() => {
                    manager.switchQueue(viewingQueueIndex);
                  }}
                />
              )}
            </div>
            <div className="other-controls-container float-right flex">
              <Button
                key={0}
                className="more-options-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName="more_horiz"
                isDisabled={currentQueue.length > 0 === false}
                clickHandler={(e) => {
                  e.stopPropagation();
                  const button = e.currentTarget;
                  const { x, y } = button.getBoundingClientRect();
                  updateContextMenuData(true, moreOptionsContextMenuItems, x + 10, y + 50);
                }}
                tooltipLabel="More Options"
                onContextMenu={(e) => {
                  e.preventDefault();
                  updateContextMenuData(true, moreOptionsContextMenuItems, e.pageX, e.pageY);
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
              <Button
                key={1}
                className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName={isMultipleSelectionEnabled ? 'remove_done' : 'checklist'}
                clickHandler={() => toggleMultipleSelections(!isMultipleSelectionEnabled, 'songs')}
                isDisabled={currentQueue.length > 0 === false}
                tooltipLabel={t(`common.${isMultipleSelectionEnabled ? 'unselectAll' : 'select'}`)}
              />
              <Button
                key={2}
                className="select-btn text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
                iconName={isAutoScrolling ? 'flash_off' : 'flash_on'}
                clickHandler={() => setIsAutoScrolling((state) => !state)}
                isDisabled={currentQueue.length > 0 === false}
                tooltipLabel={t(
                  `currentQueuePage.${isAutoScrolling ? 'disableAutoScrolling' : 'enableAutoScrolling'}`
                )}
              />
              <Button
                key={3}
                className="shuffle-all-button text-sm"
                iconName="shuffle"
                tooltipLabel={t('currentQueuePage.shuffleQueue')}
                isDisabled={currentQueue.length > 0 === false}
                clickHandler={() => {
                  manager.queues[viewingQueueIndex].shuffle();
                  dispatch({
                    type: 'UPDATE_QUEUE',
                    data: {
                      queues: manager.queues.map((q) => q.toJSON()),
                      currentQueueIndex: manager.activeQueueIndex
                    }
                  });

                  addNewNotifications([
                    {
                      id: 'shuffleQueue',
                      duration: 5000,
                      content: t('currentQueuePage.queueShuffleSuccess'),
                      iconName: 'shuffle'
                    }
                  ]);
                }}
              />
              <Button
                key="add-songs"
                label={t('currentQueuePage.addSongs', 'Add Songs')}
                className="add-songs-button text-sm"
                iconName="add"
                clickHandler={() => {
                  navigate({
                    to: '/main-player/songs',
                    search: { action: 'add-to-queue', queueIndex: viewingQueueIndex }
                  });
                }}
              />
              <Button
                key={4}
                label={t('currentQueuePage.clearQueue')}
                className="clear-queue-button text-sm"
                iconName="clear"
                isDisabled={currentQueue.length > 0 === false}
                clickHandler={() => {
                  manager.queues[viewingQueueIndex].clear();
                  dispatch({
                    type: 'UPDATE_QUEUE',
                    data: {
                      queues: manager.queues.map((q) => q.toJSON()),
                      currentQueueIndex: manager.activeQueueIndex
                    }
                  });
                  addNewNotifications([
                    {
                      id: 'clearQueue',
                      duration: 5000,
                      content: t('currentQueuePage.queueCleared'),
                      iconName: 'clear'
                    }
                  ]);
                }}
              />
            </div>
          </div>
          {currentQueue.length > 0 && (
            <div className="queue-info-container text-font-color-black dark:text-font-color-white mb-6 ml-8 flex items-center">
              <div className="cover-img-container mr-8">
                <Img
                  className={`h-20 w-20 rounded-md shadow-lg ${
                    queue.queues[queue.currentQueueIndex].metadata?.queueType === 'artist'
                      ? 'artist-img rounded-full!'
                      : `${queue.queues[queue.currentQueueIndex].metadata?.queueType}-img`
                  }`}
                  src={queueInfo?.onlineArtworkPath}
                  fallbackSrc={queueInfo?.artworkPath}
                  loading="eager"
                  alt="Current Playing Queue Cover"
                />
              </div>
              <div className="queue-info">
                <div className="queue-type text-sm font-semibold uppercase opacity-50 dark:font-medium">
                  {queue.queues[queue.currentQueueIndex].metadata?.queueType === 'recentlyAdded'
                    ? t('common.recentlyAdded', 'Recently Added')
                    : queue.queues[queue.currentQueueIndex].metadata?.queueType}
                </div>
                <div className="queue-title text-3xl">{queueInfo?.title}</div>
                <div className="other-info flex text-sm font-light">
                  <div className="queue-no-of-songs">
                    {t('common.songWithCount', { count: currentQueue.length })}
                  </div>
                  <span className="mx-1">&bull;</span>
                  <div className="queue-duration">
                    <span>{queueDuration}</span>{' '}
                    <span>
                      (
                      {t('currentQueuePage.durationRemaining', {
                        duration: completedQueueDuration
                      })}
                      )
                    </span>
                  </div>
                </div>
                {/* <div className="queue-buttons mt-4 flex"></div> */}
              </div>
            </div>
          )}
          <div
            className={`songs-container overflow-auto ${currentQueue.length > 0 ? 'h-full' : 'h-0'}`}
          >
            {currentQueue.length > 0 && (
                <DragDropContext onDragEnd={handleDragEnd}>
                  <Droppable
                    droppableId="droppable"
                    mode="virtual"
                    renderClone={(provided, _, rubric) => {
                      const songId = currentQueue[rubric.source.index];
                      const data = queuedSongsMap.get(songId);
                      if (!data) return null;
                      return (
                        <Song
                          provided={provided}
                          key={data.songId}
                          isDraggable
                          index={rubric.source.index}
                          ref={provided.innerRef}
                          isIndexingSongs={preferences?.isSongIndexingEnabled}
                          title={data.title}
                          songId={data.songId}
                          artists={data.artists}
                          album={data.album}
                          artworkPaths={data.artworkPaths}
                          duration={data.duration}
                          path={data.path}
                          isAFavorite={data.isAFavorite}
                          year={data.year}
                          isBlacklisted={data.isBlacklisted}
                        />
                      );
                    }}
                  >
                    {(droppableProvided) => (
                      <VirtualizedList
                        data={currentQueue}
                        fixedItemHeight={60}
                        ref={ListRef}
                        scrollerRef={droppableProvided.innerRef}
                        scrollKey={scrollKey}
                        components={{
                          Item: ({ children, ...props }: { children?: ReactNode }) => (
                            <div {...props} className="height-preserving-container">
                              {children}
                            </div>
                          )
                        }}
                        itemContent={(index, songId) => {
                          const song = queuedSongsMap.get(songId);
                          if (!song) return null;

                          return (
                            <QueueRow
                              key={`${song.songId}-${index}`}
                              index={index}
                              songId={songId}
                              song={song}
                              isIndexingSongs={Boolean(preferences?.isSongIndexingEnabled)}
                              selectAllHandler={selectAllHandler}
                              onPlaySong={handlePlaySong}
                              onRemoveSong={handleRemoveSong}
                            />
                          );
                        }}
                      />
                    )}
                  </Droppable>
                </DragDropContext>
              )}
          </div>
          {currentQueue.length === 0 && (
            <div className="no-songs-container text-font-color-dimmed flex h-full w-full flex-col items-center justify-center text-center text-2xl">
              <Img src={NoSongsImage} className="mb-8 w-60" alt="" /> {t('currentQueuePage.empty')}
              <Button
                label={t('currentQueuePage.addSongs', 'Add Songs')}
                iconName="add"
                className="bg-background-color-3! text-font-color-black! dark:bg-dark-background-color-3! dark:text-font-color-black mt-6 px-8 py-3 text-lg"
                clickHandler={() => navigate({ to: '/main-player/songs' })}
              />
            </div>
          )}
        </>
      )}
    </MainContainer>
  );
}
