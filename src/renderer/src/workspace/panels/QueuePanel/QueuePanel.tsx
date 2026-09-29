import SoundBarsIndicator from '@renderer/components/SoundBarsIndicator';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { getQueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useContext, useMemo, useRef, type FC, type MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Virtuoso } from 'react-virtuoso';

import type { PanelProps } from '../../registry';

function formatDuration(sec: number): string {
  if (!sec || Number.isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export const QueuePanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const { changeQueueCurrentSongIndex, updateQueueData } = useContext(AppUpdateContext);

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const queueState = useStore(store, (state) => state.localStorage.queue);

  const activeQueueIndex = queueState?.currentQueueIndex ?? 0;
  const currentQueue = queueState?.queues?.[activeQueueIndex];
  const prevSongIdsRef = useRef<number[]>([]);
  const songIds = useMemo(() => {
    const nextIds = currentQueue?.songIds ?? [];
    const prevIds = prevSongIdsRef.current;
    if (prevIds.length === nextIds.length && prevIds.every((id, i) => id === nextIds[i])) {
      return prevIds;
    }
    prevSongIdsRef.current = nextIds;
    return nextIds;
  }, [currentQueue?.songIds]);
  const currentSongIndex = currentQueue?.position ?? 0;

  const manager = getQueuesManager();
  const viewingQueue = manager?.queues?.[activeQueueIndex] ?? manager?.getActiveQueue();
  const queueId = viewingQueue?.id ?? currentQueue?.id ?? `queue-${activeQueueIndex}`;

  // Robust versioning: use queue's membershipVersion if present, else FNV-1a hash of songIds
  const queueVersion = useMemo(() => {
    if (viewingQueue?.membershipVersion !== undefined) {
      return `${queueId}:${viewingQueue.membershipVersion}`;
    }
    let hash = 2166136261;
    for (let i = 0; i < songIds.length; i++) {
      hash ^= songIds[i];
      hash = Math.imul(hash, 16777619);
    }
    return `${queueId}:${songIds.length}:${hash >>> 0}`;
  }, [viewingQueue?.membershipVersion, queueId, songIds]);

  // Stable item identity mapping to preserve Virtuoso element recycling across queue mutations
  const nextKeyRef = useRef(1);
  const prevEntriesRef = useRef<{ key: number; songId: number }[]>([]);
  const queueEntries = useMemo(() => {
    const prev = prevEntriesRef.current;
    const next: { key: number; songId: number }[] = [];
    let prevIdx = 0;
    for (let i = 0; i < songIds.length; i++) {
      const id = songIds[i];
      if (prevIdx < prev.length && prev[prevIdx].songId === id) {
        next.push(prev[prevIdx]);
        prevIdx++;
      } else {
        let foundIdx = -1;
        for (let j = prevIdx + 1; j < Math.min(prevIdx + 10, prev.length); j++) {
          if (prev[j].songId === id) {
            foundIdx = j;
            break;
          }
        }
        if (foundIdx !== -1) {
          next.push(prev[foundIdx]);
          prevIdx = foundIdx + 1;
        } else {
          next.push({ key: nextKeyRef.current++, songId: id });
        }
      }
    }
    prevEntriesRef.current = next;
    return next;
  }, [songIds]);

  const { getItem, onRangeChange } = useWindowHydration(songIds, queueVersion, {
    keyPrefix: 'queue',
    initialIndex: 0
  });

  const handlePlayQueueTrack = useCallback(
    (index: number) => {
      if (changeQueueCurrentSongIndex) {
        changeQueueCurrentSongIndex(index);
      }
    },
    [changeQueueCurrentSongIndex]
  );

  const handleRemoveTrack = useCallback(
    (e: MouseEvent, index: number) => {
      e.stopPropagation();
      const activeQueue = manager?.getActiveQueue();
      if (activeQueue) {
        activeQueue.removeSongAtPosition(index);
      } else {
        const nextIds = [...songIds];
        nextIds.splice(index, 1);
        updateQueueData(undefined, nextIds);
      }
    },
    [manager, songIds, updateQueueData]
  );

  const handleClearQueue = useCallback(() => {
    const activeQueue = manager?.getActiveQueue();
    if (activeQueue) {
      activeQueue.clear();
    } else {
      updateQueueData(0, []);
    }
  }, [manager, updateQueueData]);

  const queueTitle = useMemo(() => {
    if (currentQueue?.metadata?.title) return currentQueue.metadata.title;
    if (currentQueue?.metadata?.queueType === 'songs') return t('sideBar.songs', 'All Songs');
    return `${t('common.queue', 'Queue')} ${activeQueueIndex + 1}`;
  }, [currentQueue?.metadata, activeQueueIndex, t]);

  return (
    <div className="queue-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white flex h-full w-full flex-col overflow-hidden">
      {/* Sub-header toolbar */}
      <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 flex shrink-0 items-center justify-between border-b border-stone-200/50 px-3 py-2 dark:border-stone-800/50">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-font-color-black dark:text-font-color-white truncate text-xs font-semibold">
            {queueTitle}
          </span>
          <span className="text-font-color-dimmed rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium dark:bg-stone-800">
            {songIds.length} {t('common.song_other', 'songs')}
          </span>
        </div>

        {songIds.length > 0 && (
          <button
            type="button"
            onClick={handleClearQueue}
            title={t('currentQueuePage.clearQueue', 'Clear queue')}
            className="text-font-color-dimmed flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs transition-colors hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          >
            <span className="material-symbols-rounded text-sm">clear_all</span>
            <span>{t('common.clear', 'Clear')}</span>
          </button>
        )}
      </div>

      {/* Song list */}
      <div className="min-h-0 flex-1 overflow-hidden p-1">
        {songIds.length === 0 ? (
          <div className="text-font-color-dimmed flex h-full w-full flex-col items-center justify-center p-6 text-center">
            <span className="material-symbols-rounded mb-2 text-3xl opacity-60">queue_music</span>
            <p className="text-xs">{t('currentQueuePage.emptyQueue', 'Queue is empty')}</p>
          </div>
        ) : (
          <Virtuoso
            style={{ height: '100%' }}
            data={queueEntries}
            rangeChanged={onRangeChange}
            overscan={200}
            computeItemKey={(_index, entry) => entry.key}
            itemContent={(index, entry) => {
              const songId = entry.songId;
              const isCurrent = index === currentSongIndex;
              const song = getItem(index);
              const title = isCurrent
                ? currentSongData?.title || song?.title || `Track ${songId}`
                : song?.title || `Track ${songId}`;
              const artistNames = isCurrent
                ? Array.isArray(currentSongData?.artists) && currentSongData.artists.length > 0
                  ? currentSongData.artists.map((a) => a.name).join(', ')
                  : Array.isArray(song?.artists)
                    ? song.artists.map((a) => a.name).join(', ')
                    : ''
                : Array.isArray(song?.artists)
                  ? song.artists.map((a) => a.name).join(', ')
                  : '';
              const duration = isCurrent
                ? currentSongData?.duration || (song?.duration ?? 0)
                : (song?.duration ?? 0);

              return (
                <li
                  key={entry.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => handlePlayQueueTrack(index)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePlayQueueTrack(index);
                    }
                  }}
                  className={`group flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs transition-colors select-none ${
                    isCurrent
                      ? 'bg-accent/15 text-accent dark:bg-accent/20 font-medium'
                      : 'text-font-color-black dark:text-font-color-white hover:bg-stone-200/50 dark:hover:bg-stone-800/50'
                  }`}
                >
                  <div className="text-font-color-dimmed flex h-4 w-4 shrink-0 items-center justify-center text-[11px]">
                    {isCurrent ? (
                      <SoundBarsIndicator
                        isPlaying={isCurrentSongPlaying}
                        size="xs"
                        color="currentColor"
                      />
                    ) : (
                      <span className="group-hover:hidden">{index + 1}</span>
                    )}
                    {!isCurrent && (
                      <span className="material-symbols-rounded hidden text-sm group-hover:inline">
                        play_arrow
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 truncate">
                    <p className="truncate text-xs">{title}</p>
                    {artistNames && (
                      <p className="text-font-color-dimmed truncate text-[10px]">{artistNames}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-font-color-dimmed text-[11px]">
                      {formatDuration(duration)}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleRemoveTrack(e, index)}
                      title={t('common.removeFromQueue', 'Remove from queue')}
                      className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity group-hover:opacity-80 hover:bg-stone-300 hover:opacity-100 dark:hover:bg-stone-700"
                    >
                      <span className="material-symbols-rounded text-xs">close</span>
                    </button>
                  </div>
                </li>
              );
            }}
          />
        )}
      </div>
    </div>
  );
});

QueuePanel.displayName = 'QueuePanel';
export default QueuePanel;
