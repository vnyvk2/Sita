import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useOpenMainPlayerRoute } from '@renderer/hooks/useOpenMainPlayerRoute';
import { getQueuesManager } from '@renderer/other/queuesManager';
import toggleSongIsFavorite from '@renderer/other/toggleSongIsFavorite';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type VirtuosoHandle } from 'react-virtuoso';

import DefaultSongCover from '../../../assets/images/webp/song_cover_default.webp';
import calculateTime from '../../../utils/calculateTime';
import Img from '../../Img';
import VirtualizedList from '../../VirtualizedList';

type MiniQueueRowProps = {
  index: number;
  songId: number;
  song: SongData | undefined;
  isActivePosition: boolean;
  isCurrentSongPlaying: boolean;
  onSongClick: (index: number) => void;
  onToggleFavorite: (e: React.MouseEvent, song: SongData) => void;
  unknownArtistText: string;
  unknownAlbumText: string;
  likeText: string;
  unlikeText: string;
};

const MiniQueueRow = memo((props: MiniQueueRowProps) => {
  const {
    index,
    song,
    isActivePosition,
    isCurrentSongPlaying,
    onSongClick,
    onToggleFavorite,
    unknownArtistText,
    unknownAlbumText,
    likeText,
    unlikeText
  } = props;

  const handleClick = useCallback(() => {
    onSongClick(index);
  }, [onSongClick, index]);

  const handleFavoriteClick = useCallback(
    (e: React.MouseEvent) => {
      if (song) {
        onToggleFavorite(e, song);
      }
    },
    [onToggleFavorite, song]
  );

  const handleFavoriteKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.key === 'Enter' || e.key === ' ') && song) {
        e.preventDefault();
        onToggleFavorite(e as unknown as React.MouseEvent, song);
      }
    },
    [onToggleFavorite, song]
  );

  if (!song) {
    return (
      <div className="queue-song-item flex h-[52px] min-h-[52px] max-h-[52px] w-full items-center gap-3 overflow-hidden rounded-md px-3 py-2 opacity-50">
        <div className="h-8 w-8 shrink-0 rounded bg-white/10" />
        <div className="min-w-0 flex-1">
          <div className="h-3.5 w-24 rounded bg-white/10" />
        </div>
      </div>
    );
  }

  const { minutes, seconds } = calculateTime(song.duration);
  const formattedDuration = `${Number(minutes)}:${seconds}`;
  const isAFavorite = Boolean(song.isAFavorite);

  return (
    <button
      type="button"
      className={`queue-song-item group/songItem flex h-[52px] min-h-[52px] max-h-[52px] w-full cursor-pointer items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-left transition-colors duration-150 ${
        isActivePosition
          ? 'bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20'
          : 'hover:bg-font-color-white/10'
      }`}
      onClick={handleClick}
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
              ? 'text-font-color-highlight dark:text-dark-font-color-highlight font-medium'
              : 'text-font-color-white'
          }`}
        >
          {song.title}
        </div>
        <div className="text-font-color-white/60 mt-0.5 truncate text-xs leading-tight">
          {song.artists?.map((a) => a.name).join(', ') || unknownArtistText}
        </div>
        <div className="text-font-color-white/40 mt-0.5 truncate text-xs leading-tight">
          {song.album?.name || unknownAlbumText}
        </div>
      </div>

      {/* Right Side: Favorite Heart Button + mm:ss Duration */}
      <div className="flex shrink-0 items-center gap-1.5 [-webkit-app-region:no-drag]">
        <span
          role="button"
          tabIndex={0}
          aria-label={isAFavorite ? unlikeText : likeText}
          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-font-color-white/40 hover:text-font-color-highlight hover:bg-white/10 transition-colors"
          title={isAFavorite ? unlikeText : likeText}
          onClick={handleFavoriteClick}
          onKeyDown={handleFavoriteKeyDown}
        >
          <span
            className={`material-icons-round text-base transition-colors ${
              isAFavorite
                ? 'text-font-color-highlight dark:text-dark-font-color-highlight opacity-100'
                : 'opacity-0 group-hover/songItem:opacity-60 hover:opacity-100! hover:text-font-color-highlight'
            }`}
          >
            {isAFavorite ? 'favorite' : 'favorite_border'}
          </span>
        </span>

        <div className="text-font-color-white/50 text-xs tabular-nums min-w-[30px] text-right">
          {formattedDuration}
        </div>
      </div>
    </button>
  );
});

type Props = { isQueueVisible: boolean };

const QueueContainer = (props: Props) => {
  const { isQueueVisible } = props;

  const currentSongId = useStore(store, (state) => state.currentSongData.songId);
  const queue = useStore(store, (state) => state.localStorage.queue);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);

  const { changeQueueCurrentSongIndex, toggleIsFavorite } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const openMainPlayerRoute = useOpenMainPlayerRoute();
  const queryClient = useQueryClient();

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const isFirstScrollRef = useRef(true);

  const [viewingQueueIndex, setViewingQueueIndex] = useState(queue.currentQueueIndex);

  useEffect(() => {
    if (viewingQueueIndex !== queue.currentQueueIndex && queue.queues.length <= viewingQueueIndex) {
      setViewingQueueIndex(queue.currentQueueIndex);
    }
  }, [queue.currentQueueIndex, queue.queues.length, viewingQueueIndex]);

  useEffect(() => {
    setViewingQueueIndex(queue.currentQueueIndex);
  }, [queue.currentQueueIndex]);

  const manager = getQueuesManager();

  const currentQueue = queue.queues[viewingQueueIndex];
  const songIds = useMemo(() => currentQueue?.songIds || [], [currentQueue?.songIds]);
  const queueId = currentQueue?.id ?? 'active';
  const membershipVersion = manager?.queues?.[viewingQueueIndex]?.membershipVersion ?? 0;

  const { data: queuedSongs } = useQuery({
    ...songQuery.queue({
      songIds,
      queueId,
      membershipVersion
    }),
    enabled: songIds.length > 0 && isQueueVisible
  });

  const activePosition = queue.queues[queue.currentQueueIndex]?.position ?? -1;
  const isViewingActiveQueue = viewingQueueIndex === queue.currentQueueIndex;

  // Auto-scroll to the currently playing song when the queue opens or active song changes
  useEffect(() => {
    if (!isQueueVisible) {
      isFirstScrollRef.current = true;
      return;
    }

    if (isViewingActiveQueue && activePosition >= 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: activePosition,
        align: 'center',
        behavior: isFirstScrollRef.current ? 'auto' : 'smooth'
      });
      isFirstScrollRef.current = false;
    }
  }, [isQueueVisible, isViewingActiveQueue, activePosition]);

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
        }
      }
    },
    [manager, viewingQueueIndex, queue.currentQueueIndex, changeQueueCurrentSongIndex]
  );

  const handleToggleFavorite = useCallback(
    (e: React.MouseEvent, song: SongData) => {
      e.stopPropagation();
      toggleSongIsFavorite(song.songId, Boolean(song.isAFavorite))
        .then((newFavorite) => {
          if (typeof newFavorite === 'boolean') {
            if (song.songId === currentSongId) {
              toggleIsFavorite(newFavorite);
            }
            queryClient.invalidateQueries({
              queryKey: songQuery.queue({
                songIds,
                queueId,
                membershipVersion
              }).queryKey
            });
          }
        })
        .catch((err) => {
          console.error('Failed to toggle song favorite:', err);
        });
    },
    [currentSongId, toggleIsFavorite, queryClient, songIds, queueId, membershipVersion]
  );

  const queuedSongsMap = useMemo(() => {
    if (!queuedSongs) return new Map<number, SongData>();
    return new Map(queuedSongs.map((s) => [s.songId, s]));
  }, [queuedSongs]);

  if (!isQueueVisible) return null;

  return (
    <div
      data-testid="queue-container"
      className="mini-player-queue-container relative z-20 flex flex-1 flex-col overflow-hidden border-t border-white/5 bg-[rgba(33,34,38,0.5)] backdrop-blur-md [-webkit-app-region:no-drag]"
    >
      {/* Header */}
      <div className="shrink-0 px-4 py-3 [-webkit-app-region:no-drag]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              className="text-font-color-white/60 hover:text-font-color-white disabled:hover:text-font-color-white/60 focus-visible:outline-none disabled:opacity-30 [-webkit-app-region:no-drag] cursor-pointer"
              disabled={queue.queues.length <= 1}
              onClick={() =>
                setViewingQueueIndex((prev) => (prev > 0 ? prev - 1 : queue.queues.length - 1))
              }
            >
              <span className="material-icons-round text-sm">chevron_left</span>
            </button>
            <span className="text-font-color-white text-xs font-semibold tracking-wider uppercase opacity-60 select-none">
              {viewingQueueIndex === queue.currentQueueIndex
                ? t('currentQueuePage.queue', 'Currently Playing Queue')
                : queue.queues[viewingQueueIndex]?.metadata?.title ||
                  (queue.queues[viewingQueueIndex]?.metadata?.queueType === 'songs'
                    ? 'All Songs'
                    : `Queue ${viewingQueueIndex + 1}`)}
            </span>
            <button
              className="text-font-color-white/60 hover:text-font-color-white disabled:hover:text-font-color-white/60 focus-visible:outline-none disabled:opacity-30 [-webkit-app-region:no-drag] cursor-pointer"
              disabled={queue.queues.length <= 1}
              onClick={() =>
                setViewingQueueIndex((prev) => (prev < queue.queues.length - 1 ? prev + 1 : 0))
              }
            >
              <span className="material-icons-round text-sm">chevron_right</span>
            </button>
            {viewingQueueIndex !== queue.currentQueueIndex &&
              (queue.queues[viewingQueueIndex]?.songIds?.length ?? 0) > 0 && (
                <button
                  className="bg-font-color-highlight/20 dark:bg-dark-font-color-highlight/20 text-font-color-highlight dark:text-dark-font-color-highlight hover:bg-font-color-highlight hover:text-font-color-white ml-2 flex h-5 w-5 items-center justify-center rounded-full transition-colors focus-visible:outline-none [-webkit-app-region:no-drag] cursor-pointer"
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
            {songIds.length > 0 ? t('common.songWithCount', { count: songIds.length }) : ''}
          </span>
        </div>
      </div>

      {/* Virtualized Song List */}
      <div className="min-h-0 flex-1 overflow-hidden px-1 pb-2">
        {songIds.length > 0 ? (
          <VirtualizedList<number>
            ref={virtuosoRef}
            data={songIds}
            fixedItemHeight={52}
            initialItemCount={15}
            style={{ height: '100%' }}
            itemContent={(index, id) => (
              <MiniQueueRow
                index={index}
                songId={id}
                song={queuedSongsMap.get(id)}
                isActivePosition={isViewingActiveQueue && index === activePosition}
                isCurrentSongPlaying={isCurrentSongPlaying}
                onSongClick={handleSongClick}
                onToggleFavorite={handleToggleFavorite}
                unknownArtistText={t('common.unknownArtist')}
                unknownAlbumText={t('common.unknownAlbum', 'Unknown Album')}
                likeText={t('song.likeSong', 'Like')}
                unlikeText={t('song.unlikeSong', 'Unlike')}
              />
            )}
          />
        ) : (
          <div className="text-font-color-white/40 flex h-full flex-col items-center justify-center gap-4 text-sm">
            {t('currentQueuePage.empty', 'Queue is empty')}
            <button
              className="text-font-color-highlight dark:text-dark-font-color-highlight border-font-color-highlight dark:border-dark-font-color-highlight hover:bg-font-color-highlight rounded-full border px-4 py-2 transition-colors hover:text-white"
              onClick={() => {
                openMainPlayerRoute({
                  to: '/main-player/songs',
                  search: { action: 'add-to-queue', queueIndex: viewingQueueIndex }
                });
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
