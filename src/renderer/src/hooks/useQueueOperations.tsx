import { useCallback } from 'react';

import { getQueuesManager } from '../other/queuesManager';

export function useQueueOperations() {
  const manager = getQueuesManager();

  const getActiveQueue = useCallback(() => manager.getActiveQueue(), [manager]);

  const addToNext = useCallback(
    (songIds: number[]) => {
      const playerQueue = getActiveQueue();
      // We ignore removeDuplicates for now as it's not supported by QueuesManager natively yet
      playerQueue.addSongIdsToNext(songIds);
      return songIds.length;
    },
    [getActiveQueue]
  );

  const addToEnd = useCallback(
    (songIds: number[]) => {
      const playerQueue = getActiveQueue();
      playerQueue.addSongIdsToEnd(songIds);
      return songIds.length;
    },
    [getActiveQueue]
  );

  const removeSongs = useCallback(
    (songIds: number[]) => {
      const playerQueue = getActiveQueue();
      playerQueue.removeSongIds(songIds);
      return songIds.length;
    },
    [getActiveQueue]
  );

  const clearQueue = useCallback(() => {
    const playerQueue = getActiveQueue();
    playerQueue.clear();
  }, [getActiveQueue]);

  const playNext = useCallback(
    (songIds: number[]) => {
      const playerQueue = getActiveQueue();
      playerQueue.playNext(songIds);
      return songIds.length;
    },
    [getActiveQueue]
  );

  return { addToNext, addToEnd, removeSongs, clearQueue, playNext };
}
