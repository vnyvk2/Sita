import { useCallback } from 'react';

import { getQueuesManager } from '../other/queuesManager';
import type { CanonicalQueueRequestOptions } from '../other/queuesManager';
import { dispatch, store } from '../store/store';

export interface QueueManagementDependencies {
  playSong: (songId: number, isStartPlay?: boolean) => void;
}

/** UI-level canonical All Songs request; adds playback intent on top of the queue-domain options. */
export interface PlayAllSongsOptions extends CanonicalQueueRequestOptions {
  /** Whether resolving the request should start audio playback. Defaults to true. */
  startPlaying?: boolean;
}

export function useQueueManagement(dependencies: QueueManagementDependencies) {
  const { playSong } = dependencies;
  const manager = getQueuesManager();

  const getActiveQueue = useCallback(() => manager.getActiveQueue(), [manager]);

  const createQueue = useCallback(
    (
      newQueue: number[],
      queueType: QueueTypes,
      isShuffleQueue = false,
      queueId?: string | number,
      startPlaying = true,
      queueTitle?: string
    ) => {
      if (newQueue.length === 0) {
        return console.error('Cannot create an empty queue.');
      }

      const playerQueue = manager.createQueue(queueTitle, newQueue);
      playerQueue.setMetadata({
        queueId,
        queueType,
        title: queueTitle
      });

      if (isShuffleQueue) {
        playerQueue.shuffle();
      }

      manager.switchQueue(manager.queues.length - 1);

      if (startPlaying && playerQueue.currentSongId) {
        playSong(playerQueue.currentSongId as number, true);
      }
    },
    [manager, playSong]
  );

  const playAllSongs = useCallback(
    (options: PlayAllSongsOptions) => {
      if (!options.songIds || options.songIds.length === 0) {
        if (options.shuffle || options.startPlaying !== false) {
          return console.error('Cannot create an empty queue.');
        }
        return undefined;
      }

      const playerQueue = manager.getOrCreateCanonicalQueue(options);

      if (options.startPlaying !== false && playerQueue?.currentSongId != null) {
        playSong(playerQueue.currentSongId, true);
      }
      return playerQueue;
    },
    [manager, playSong]
  );

  const updateQueueData = useCallback(
    (
      currentSongIndex?: number,
      queue?: number[],
      isShuffleQueue = false,
      playCurrentSongIndex = false,
      restoreAndClearPreviousQueue = false
    ) => {
      const playerQueue = getActiveQueue();

      if (queue) {
        playerQueue.replaceQueue(queue, currentSongIndex ?? playerQueue.position, false);
      } else if (currentSongIndex !== undefined) {
        playerQueue.moveToPosition(currentSongIndex);
      }

      if (isShuffleQueue) {
        playerQueue.shuffle();
      }

      if (restoreAndClearPreviousQueue) {
        playerQueue.clearShuffleHistory();
      }

      if (playCurrentSongIndex && playerQueue.currentSongId) {
        playSong(playerQueue.currentSongId, true);
      }
    },
    [getActiveQueue, playSong]
  );

  const toggleQueueShuffle = useCallback(
    (isShuffle?: boolean | unknown) => {
      const playerQueue = getActiveQueue();
      if (typeof isShuffle === 'boolean') {
        if (isShuffle) {
          playerQueue.shuffle();
        } else {
          playerQueue.restoreFromShuffle();
        }
      } else {
        if (playerQueue.queueBeforeShuffle) {
          playerQueue.restoreFromShuffle();
        } else {
          playerQueue.shuffle();
        }
      }
    },
    [getActiveQueue]
  );

  const toggleShuffling = useCallback(
    (isShuffling?: boolean) => {
      const newState = isShuffling ?? !store.state.player.isShuffling;
      dispatch({ type: 'TOGGLE_SHUFFLE_STATE', data: newState });
      toggleQueueShuffle(newState);
    },
    [toggleQueueShuffle]
  );

  const changeUpNextSongData = useCallback((upNextSongData?: AudioPlayerData) => {
    dispatch({ type: 'UP_NEXT_SONG_DATA_CHANGE', data: upNextSongData });
  }, []);

  return {
    createQueue,
    playAllSongs,
    updateQueueData,
    toggleQueueShuffle,
    toggleShuffling,
    changeUpNextSongData
  };
}
