import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { useNavigate } from '@tanstack/react-router';

import DefaultSongCover from '../../../assets/images/webp/song_cover_default.webp';
import Img from '../../Img';
import calculateTimeFromSeconds from '../../../utils/calculateTimeFromSeconds';

type Props = { isQueueVisible: boolean };

const QueueContainer = (props: Props) => {
  const { isQueueVisible } = props;

  const currentSongId = useStore(store, (state) => state.currentSongData.songId);
  const queue = useStore(store, (state) => state.localStorage.queue);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);

  const { changeQueueCurrentSongIndex } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();

  const listRef = useRef<HTMLDivElement>(null);
  
  const [viewingQueueIndex, setViewingQueueIndex] = useState(queue.currentQueueIndex);
  
  useEffect(() => {
    setViewingQueueIndex(queue.currentQueueIndex);
  }, [queue.currentQueueIndex]);

  const manager = getQueuesManager();

  const currentQueue = queue.queues[viewingQueueIndex];
  const songIds = currentQueue?.songIds || [];

  const { data: queuedSongs } = useQuery({
    ...songQuery.queue(songIds),
    enabled: songIds.length > 0 && isQueueVisible
  });

  // Auto-scroll to the currently playing song when the queue opens
  useEffect(() => {
    const activeQueue = queue.queues[queue.currentQueueIndex];
    const activeSongIds = activeQueue?.songIds || [];

    if (isQueueVisible && queuedSongs && listRef.current && viewingQueueIndex === queue.currentQueueIndex) {
      const activeIndex = activeSongIds.indexOf(currentSongId);
      if (activeIndex >= 0) {
        // Each item is ~52px tall. Scroll so the active item is centered.
        const itemHeight = 52;
        const containerHeight = listRef.current.clientHeight;
        const scrollTarget = activeIndex * itemHeight - containerHeight / 2 + itemHeight / 2;
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
        });
      }
    }
  }, [isQueueVisible, queuedSongs, currentSongId, queue.queues[queue.currentQueueIndex]?.songIds, viewingQueueIndex, queue.currentQueueIndex]);

  const handleSongClick = useCallback(
    (index: number) => {
      const queueToPlay = manager.queues[viewingQueueIndex];
      if (queueToPlay) {
        queueToPlay.moveToPosition(index);
        
        if (viewingQueueIndex !== queue.currentQueueIndex) {
          manager.switchQueue(viewingQueueIndex);
        } else {
          // If already in the active queue, trigger playback via context
          changeQueueCurrentSongIndex(index);
          // Wait, changeQueueCurrentSongIndex(index) calls moveToPosition(index) again. 
          // But that's fine because if it's already there it might just re-trigger or we can just let changeQueueCurrentSongIndex handle it.
        }
      }
    },
    [changeQueueCurrentSongIndex, viewingQueueIndex, queue.currentQueueIndex, manager]
  );

  const songItems = useMemo(() => {
    if (!queuedSongs) return null;
    
    const currentQueueSongIds = queue.queues[viewingQueueIndex]?.songIds || [];

    return currentQueueSongIds.map((id, index) => {
      const song = queuedSongs.find(s => s.songId === id);
      if (!song) return null;

      const isActivePosition = viewingQueueIndex === queue.currentQueueIndex && index === queue.queues[queue.currentQueueIndex]?.position;
      
      const duration = calculateTimeFromSeconds(song.duration);

      return (
        <button
          key={`${id}-${index}`}
          type="button"
          className={`queue-song-item flex w-full h-[52px] min-h-[52px] overflow-hidden cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150 ${
            isActivePosition
              ? 'bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20'
              : 'hover:bg-font-color-white/10'
          }`}
          onClick={() => handleSongClick(index)}
        >
          {/* Artwork */}
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded">
            <Img
              src={song.artworkPaths?.optimizedArtworkPath || song.artworkPaths?.artworkPath}
              fallbackSrc={DefaultSongCover}
              loading="lazy"
              alt={song.title}
              className="h-full w-full object-cover"
            />
            {isActivePosition && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-sm">
                  {isCurrentSongPlaying ? 'equalizer' : 'pause'}
                </span>
              </div>
            )}
          </div>

          {/* Song Info */}
          <div className="min-w-0 flex-1">
            <div
              className={`truncate text-sm leading-tight ${
                isActivePosition
                  ? 'text-font-color-highlight font-medium dark:text-dark-font-color-highlight'
                  : 'text-font-color-white'
              }`}
            >
              {song.title}
            </div>
            <div className="text-font-color-white/60 truncate text-xs leading-tight mt-0.5">
              {song.artists?.map((a) => a.name).join(', ') || t('common.unknownArtist')}
            </div>
            <div className="text-font-color-white/40 truncate text-xs leading-tight mt-0.5">
              {song.album?.name || t('common.unknownAlbum', 'Unknown Album')}
            </div>
          </div>

          {/* Right Side: Duration & Favorite */}
          <div className="flex flex-col items-end justify-center shrink-0 gap-1">
            <div className="text-font-color-white/40 text-xs tabular-nums">
              {duration.timeString}
            </div>
            {song.isAFavorite ? (
              <span className="material-icons-round text-font-color-highlight dark:text-dark-font-color-highlight text-[14px]">
                favorite
              </span>
            ) : (
              <div className="h-[14px] w-[14px]" />
            )}
          </div>
        </button>
      );
    });
  }, [queuedSongs, queue.queues, viewingQueueIndex, queue.currentQueueIndex, isCurrentSongPlaying, handleSongClick, t]);

  if (!isQueueVisible) return null;

  return (
    <div className="mini-player-queue-container relative z-20 flex flex-1 flex-col overflow-hidden bg-[rgba(33,34,38,0.5)] backdrop-blur-md border-t border-white/5">
      {/* Header */}
      <div className="shrink-0 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button 
              className="text-font-color-white/60 hover:text-font-color-white focus-visible:outline-none disabled:opacity-30 disabled:hover:text-font-color-white/60"
              disabled={queue.queues.length <= 1}
              onClick={() => setViewingQueueIndex(prev => prev > 0 ? prev - 1 : queue.queues.length - 1)}
            >
              <span className="material-icons-round text-sm">chevron_left</span>
            </button>
            <span className="text-font-color-white text-xs font-semibold uppercase tracking-wider opacity-60">
              {viewingQueueIndex === queue.currentQueueIndex 
                 ? t('currentQueuePage.queue', 'Currently Playing Queue')
                 : (queue.queues[viewingQueueIndex]?.metadata?.title || (queue.queues[viewingQueueIndex]?.metadata?.queueType === 'songs' ? 'All Songs' : `Queue ${viewingQueueIndex + 1}`))}
            </span>
            <button 
              className="text-font-color-white/60 hover:text-font-color-white focus-visible:outline-none disabled:opacity-30 disabled:hover:text-font-color-white/60"
              disabled={queue.queues.length <= 1}
              onClick={() => setViewingQueueIndex(prev => prev < queue.queues.length - 1 ? prev + 1 : 0)}
            >
              <span className="material-icons-round text-sm">chevron_right</span>
            </button>
            {viewingQueueIndex !== queue.currentQueueIndex && (queue.queues[viewingQueueIndex]?.songIds?.length ?? 0) > 0 && (
              <button 
                className="ml-2 flex items-center justify-center bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20 text-font-color-highlight dark:text-dark-font-color-highlight rounded-full h-5 w-5 hover:bg-font-color-highlight hover:text-font-color-white focus-visible:outline-none transition-colors"
                title={t('common.play', 'Play')}
                onClick={() => {
                  if (manager) {
                    manager.switchQueue(viewingQueueIndex);
                  }
                }}
              >
                <span className="material-icons-round text-xs">play_arrow</span>
              </button>
            )}
          </div>
          <span className="text-font-color-white/40 text-xs">
            {queuedSongs
              ? t('common.songWithCount', { count: queuedSongs.length })
              : ''}
          </span>
        </div>
      </div>

      {/* Song List */}
      <div
        ref={listRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-1 pb-4 custom-scrollbar"
      >
        {queuedSongs && queuedSongs.length > 0 ? (
          songItems
        ) : (
          <div className="text-font-color-white/40 flex h-full items-center justify-center text-sm flex-col gap-4">
            {t('currentQueuePage.empty', 'Queue is empty')}
            <button 
              className="text-font-color-highlight dark:text-dark-font-color-highlight border border-font-color-highlight dark:border-dark-font-color-highlight px-4 py-2 rounded-full hover:bg-font-color-highlight hover:text-white transition-colors"
              onClick={() => {
                navigate({ to: '/main-player/songs', search: { action: 'add-to-queue', queueIndex: viewingQueueIndex } });
              }}
            >
              {t('currentQueuePage.addSongs', 'Add Songs')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default QueueContainer;
