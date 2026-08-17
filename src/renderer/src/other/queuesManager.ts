import { store } from '../store/store';
import storage from '../utils/localStorage';
import PlayerQueue from './playerQueue';

export type QueuesManagerEvent = 'activeQueueChanged' | 'queuesChanged';
type QueuesManagerCallback = () => void;

type QueueStoreState = {
  localStorage?: LocalStorage;
};

type QueueSubscriptionState =
  | QueueStoreState
  | {
      currentVal?: QueueStoreState;
      prevVal?: QueueStoreState;
    };

const getQueueSubscriptionState = (subscriptionState: QueueSubscriptionState): QueueStoreState => {
  if ('currentVal' in subscriptionState && subscriptionState.currentVal) {
    return subscriptionState.currentVal;
  }
  return subscriptionState as QueueStoreState;
};

export class QueuesManager {
  queues: PlayerQueue[];
  activeQueueIndex: number;
  private isSettingUpSync = false;
  private isSyncingFromStore = false;
  private isSyncingToStore = false;
  private listeners: Map<QueuesManagerEvent, Set<QueuesManagerCallback>>;
  private queueListeners: Map<string, (() => void)[]>;
  private lastSyncedStructureVersions: Map<string, number>;

  constructor() {
    this.queues = [];
    this.activeQueueIndex = 0;
    this.listeners = new Map();
    this.queueListeners = new Map();
    this.lastSyncedStructureVersions = new Map();
  }

  on(event: QueuesManagerEvent, callback: QueuesManagerCallback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: QueuesManagerEvent) {
    this.listeners.get(event)?.forEach((cb) => cb());
  }

  initialize() {
    const storedState = storage.queue.getQueue();
    if (storedState && storedState.queues && storedState.queues.length > 0) {
      this.queues = storedState.queues.map((q) => PlayerQueue.fromJSON(q));
      this.activeQueueIndex =
        storedState.currentQueueIndex >= 0 && storedState.currentQueueIndex < this.queues.length
          ? storedState.currentQueueIndex
          : 0;
    } else {
      this.queues = [new PlayerQueue()];
      this.activeQueueIndex = 0;
    }

    this.queues.forEach((q) => this.bindQueueEvents(q));

    if (!this.isSettingUpSync) {
      this.setupStoreSync();
    }
  }

  getActiveQueue(): PlayerQueue {
    if (this.queues.length === 0) {
      const newQueue = new PlayerQueue();
      this.queues.push(newQueue);
      this.bindQueueEvents(newQueue);
      this.activeQueueIndex = 0;
    }
    return this.queues[this.activeQueueIndex];
  }

  getQueues(): PlayerQueue[] {
    return this.queues;
  }

  createQueue(name?: string, songIds: number[] = []): PlayerQueue {
    let queueTitle = name || `Queue ${this.queues.length + 1}`;

    if (this.queues.length === 1 && this.queues[0].songIds.length === 0) {
      this.unbindQueueEvents(this.queues[0]);
      this.queues = [];
      queueTitle = name || 'Queue 1';
    }

    const newQueue = new PlayerQueue(songIds, 0, undefined, { title: queueTitle });
    this.queues.push(newQueue);
    this.bindQueueEvents(newQueue);

    this.triggerStoreSync();
    this.emit('queuesChanged');
    return newQueue;
  }

  switchQueue(index: number) {
    if (index >= 0 && index < this.queues.length) {
      this.activeQueueIndex = index;
      this.triggerStoreSync();
      this.emit('activeQueueChanged');
    }
  }

  deleteQueue(queueId: string) {
    const index = this.queues.findIndex((q) => q.id === queueId);
    if (index >= 0 && index < this.queues.length) {
      if (this.queues[index].getMetadata().isLocked) {
        console.warn(`Attempted to delete locked queue ${queueId}`);
        return;
      }
      const [removed] = this.queues.splice(index, 1);
      this.unbindQueueEvents(removed);

      if (this.queues.length === 0) {
        const newQueue = new PlayerQueue();
        this.queues.push(newQueue);
        this.bindQueueEvents(newQueue);
      }

      let activeQueueChanged = false;

      if (index === this.activeQueueIndex) {
        activeQueueChanged = true;
        if (this.activeQueueIndex >= this.queues.length) {
          this.activeQueueIndex = Math.max(0, this.queues.length - 1);
        }
      } else if (index < this.activeQueueIndex) {
        this.activeQueueIndex -= 1;
      }

      this.triggerStoreSync();
      this.emit('queuesChanged');

      if (activeQueueChanged) {
        this.emit('activeQueueChanged');
      }
    }
  }

  toggleQueueLock(queueId: string): boolean {
    const queue = this.queues.find((q) => q.id === queueId);
    if (queue) {
      const isCurrentlyLocked = !!queue.getMetadata().isLocked;
      queue.setMetadata({ isLocked: !isCurrentlyLocked });
      this.triggerStoreSync();
      this.emit('queuesChanged');
      return true;
    }
    return false;
  }

  removeAllQueues(): { deleted: number; kept: number } {
    let deletedCount = 0;
    let keptCount = 0;

    // Preserve reference to the currently active queue before filtering
    const activeQueue = this.queues[this.activeQueueIndex];
    const activeQueueId = activeQueue?.id;

    const remainingQueues = this.queues.filter((q, index) => {
      if (q.getMetadata().isLocked || index === this.activeQueueIndex) {
        keptCount++;
        return true;
      }
      this.unbindQueueEvents(q);
      deletedCount++;
      return false;
    });

    let activeQueueChanged = false;

    if (remainingQueues.length === 0) {
      const newQueue = new PlayerQueue();
      this.bindQueueEvents(newQueue);
      this.queues = [newQueue];
      this.activeQueueIndex = 0;
      activeQueueChanged = true;
    } else {
      this.queues = remainingQueues;
      // If the previously active queue survived, maintain its active status; otherwise activate the first surviving queue
      const newActiveIndex = this.queues.findIndex((q) => q.id === activeQueueId);
      if (newActiveIndex >= 0) {
        this.activeQueueIndex = newActiveIndex;
      } else {
        this.activeQueueIndex = 0;
        activeQueueChanged = true;
      }
    }

    this.triggerStoreSync();
    this.emit('queuesChanged');

    if (activeQueueChanged) {
      this.emit('activeQueueChanged');
    }

    return { deleted: deletedCount, kept: keptCount };
  }

  renameQueue(queueId: string, newName: string) {
    const queue = this.queues.find((q) => q.id === queueId);
    if (queue) {
      queue.setMetadata({ title: newName });
    }
  }

  addSongsToQueue(queueId: string, songIds: number[]) {
    const queue = this.queues.find((q) => q.id === queueId);
    if (queue) {
      queue.addSongIdsToEnd(songIds);
    }
  }

  reorderQueues(startIndex: number, endIndex: number) {
    if (
      startIndex >= 0 &&
      startIndex < this.queues.length &&
      endIndex >= 0 &&
      endIndex < this.queues.length &&
      startIndex !== endIndex
    ) {
      const activeQueueWasReordered = this.activeQueueIndex === startIndex;
      const result = Array.from(this.queues);
      const [removed] = result.splice(startIndex, 1);
      result.splice(endIndex, 0, removed);
      this.queues = result;

      // Update activeQueueIndex to reflect the shift
      if (activeQueueWasReordered) {
        this.activeQueueIndex = endIndex;
      } else {
        if (startIndex < this.activeQueueIndex && endIndex >= this.activeQueueIndex) {
          this.activeQueueIndex--;
        } else if (startIndex > this.activeQueueIndex && endIndex <= this.activeQueueIndex) {
          this.activeQueueIndex++;
        }
      }

      this.triggerStoreSync();
      this.emit('queuesChanged');
    }
  }

  private bindQueueEvents(queue: PlayerQueue) {
    this.unbindQueueEvents(queue);

    const unsubs = [
      queue.on('queueChange', () => {
        this.triggerStoreSync();
      }),
      queue.on('positionChange', () => {
        this.triggerStoreSync();
      }),
      queue.on('metadataChange', () => {
        this.triggerStoreSync();
      })
    ];

    this.queueListeners.set(queue.id, unsubs);
  }

  private unbindQueueEvents(queue: PlayerQueue) {
    const unsubs = this.queueListeners.get(queue.id);
    if (unsubs) {
      unsubs.forEach((unsub) => unsub());
      this.queueListeners.delete(queue.id);
      this.lastSyncedStructureVersions.delete(queue.id);
    }
  }

  private triggerStoreSync() {
    if (this.isSyncingFromStore || this.isSyncingToStore) return;
    this.isSyncingToStore = true;
    try {
      this.queues.forEach((q) => {
        this.lastSyncedStructureVersions.set(q.id, q.structureVersion);
      });
      store.setState((state) => ({
        ...state,
        localStorage: {
          ...state.localStorage,
          queue: {
            queues: this.queues.map((q) => q.toJSON()),
            currentQueueIndex: this.activeQueueIndex
          }
        }
      }));
    } finally {
      this.isSyncingToStore = false;
    }
  }

  private setupStoreSync() {
    if (this.isSettingUpSync) return;
    this.isSettingUpSync = true;

    store.subscribe((state) => {
      if (this.isSyncingToStore || this.isSyncingFromStore) return;

      const currentState = getQueueSubscriptionState(state as QueueSubscriptionState);
      const storeQueuesState = currentState.localStorage?.queue;

      if (!storeQueuesState) return;

      let needsFullSync = false;

      // Check if queues length changed
      if (this.queues.length !== storeQueuesState.queues.length) {
        needsFullSync = true;
      } else {
        // Check if queues order or IDs changed
        for (let i = 0; i < this.queues.length; i++) {
          if (this.queues[i].id !== storeQueuesState.queues[i].id) {
            needsFullSync = true;
            break;
          }
        }
      }

      const indexChanged = this.activeQueueIndex !== storeQueuesState.currentQueueIndex;

      // Check if any individual queue's content changed
      let anyQueueContentChanged = false;
      if (!needsFullSync) {
        for (let i = 0; i < this.queues.length; i++) {
          const q = this.queues[i];
          const sq = storeQueuesState.queues[i];
          const lastVersion = this.lastSyncedStructureVersions.get(q.id);
          const hasStructureVersionChanged =
            lastVersion !== undefined && lastVersion !== q.structureVersion;
          if (
            q.songIds !== sq.songIds ||
            hasStructureVersionChanged ||
            q.position !== sq.position ||
            q.metadata?.title !== sq.metadata?.title ||
            !!q.queueBeforeShuffle !== !!sq.queueBeforeShuffle
          ) {
            anyQueueContentChanged = true;
            break;
          }
        }
      }

      if (needsFullSync || indexChanged || anyQueueContentChanged) {
        this.isSyncingFromStore = true;

        try {
          if (needsFullSync) {
            this.queues.forEach((q) => {
              this.unbindQueueEvents(q);
            });

            this.queues = storeQueuesState.queues.map((qState) => {
              return PlayerQueue.fromJSON(qState);
            });
            this.queues.forEach((q) => {
              this.bindQueueEvents(q);
              this.lastSyncedStructureVersions.set(q.id, q.structureVersion);
            });

            this.activeQueueIndex = storeQueuesState.currentQueueIndex;
            this.emit('queuesChanged');
            if (indexChanged) {
              this.emit('activeQueueChanged');
            }
          } else {
            // Update contents of queues in place
            for (let i = 0; i < this.queues.length; i++) {
              const q = this.queues[i];
              const sq = storeQueuesState.queues[i];

              if (!sq || !Array.isArray(sq.songIds)) {
                console.error('Invalid queue state restored', sq);
                continue;
              }

              const lastVersion = this.lastSyncedStructureVersions.get(q.id);
              const hasStructureVersionChanged =
                lastVersion !== undefined && lastVersion !== q.structureVersion;
              const songIdsChanged = q.songIds !== sq.songIds || hasStructureVersionChanged;
              const positionChanged = q.position !== sq.position;
              const metadataChanged = q.metadata?.title !== sq.metadata?.title;
              const shuffleChanged = !!q.queueBeforeShuffle !== !!sq.queueBeforeShuffle;

              if (songIdsChanged || metadataChanged || shuffleChanged) {
                q.replaceQueue(sq.songIds, sq.position ?? 0, false, sq.metadata);
                q.queueBeforeShuffle = sq.queueBeforeShuffle;
                this.lastSyncedStructureVersions.set(q.id, q.structureVersion);
              } else if (positionChanged) {
                q.moveToPosition(sq.position ?? 0);
              }
            }
            if (indexChanged) {
              this.activeQueueIndex = storeQueuesState.currentQueueIndex;
              this.emit('activeQueueChanged');
            }
          }
        } finally {
          this.isSyncingFromStore = false;
        }
      }
    });
  }

  removeAllListeners() {
    this.listeners.clear();
    this.queues.forEach((q) => this.unbindQueueEvents(q));
  }
}

declare global {
  interface Window {
    __NORA_QUEUES_MANAGER__?: QueuesManager | null;
  }
}

let managerInstance: QueuesManager | null = null;

export function initializeQueuesManager(): QueuesManager {
  if (typeof window !== 'undefined' && window.__NORA_QUEUES_MANAGER__) {
    managerInstance = window.__NORA_QUEUES_MANAGER__;
    return managerInstance;
  }
  if (managerInstance) return managerInstance;
  managerInstance = new QueuesManager();
  managerInstance.initialize();
  if (typeof window !== 'undefined') {
    window.__NORA_QUEUES_MANAGER__ = managerInstance;
  }
  return managerInstance;
}

export function getQueuesManager(): QueuesManager {
  if (typeof window !== 'undefined' && window.__NORA_QUEUES_MANAGER__) {
    managerInstance = window.__NORA_QUEUES_MANAGER__;
    return managerInstance;
  }
  if (!managerInstance) {
    return initializeQueuesManager();
  }
  return managerInstance;
}

export function resetQueuesManagerForTesting() {
  if (managerInstance) {
    managerInstance.removeAllListeners();
    managerInstance = null;
  }
  if (typeof window !== 'undefined' && window.__NORA_QUEUES_MANAGER__) {
    window.__NORA_QUEUES_MANAGER__.removeAllListeners();
    window.__NORA_QUEUES_MANAGER__ = null;
  }
}
