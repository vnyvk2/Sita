import type { MigrationData } from '../utils/localStorage';
import { LOCAL_STORAGE_DEFAULT_TEMPLATE } from './appReducer';

const localStorageMigrationData: MigrationData = {
  '4.0.0-alpha.3': (_) => {
    return LOCAL_STORAGE_DEFAULT_TEMPLATE;
  },
  '4.0.0-alpha.4': (data) => {
    if (data.preferences?.seekbarScrollInterval === undefined) {
      data.preferences.seekbarScrollInterval = 5;
    }
    return data;
  },
  '4.0.0-alpha.5': (data) => {
    // Migrate from single queue to multiple queues array
    // Check if the old queue structure exists (songIds at root)
    if (data.queue && (data.queue as any).songIds !== undefined) {
      const oldQueue = data.queue as any;
      data.queue = {
        queues: [
          {
            id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `queue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            songIds: Array.isArray(oldQueue.songIds) ? oldQueue.songIds : [],
            position: typeof oldQueue.position === 'number' ? oldQueue.position : 0,
            queueBeforeShuffle: Array.isArray(oldQueue.queueBeforeShuffle)
              ? oldQueue.queueBeforeShuffle
              : undefined,
            metadata: oldQueue.metadata
          }
        ],
        currentQueueIndex: 0
      };
    } else if (data.queue && !Array.isArray((data.queue as any).queues)) {
      data.queue = {
        queues: [
          {
            id: globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `queue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            songIds: [],
            position: 0,
          }
        ],
        currentQueueIndex: 0
      };
    }
    return data;
  }
};

export default localStorageMigrationData;
