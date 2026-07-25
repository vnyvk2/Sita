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
  private listeners: Map<QueuesManagerEvent, Set<QueuesManagerCallback>>;
  private activeQueueUnsubscribe: (() => void)[] = [];

  constructor() {
    this.queues = [];
    this.activeQueueIndex = 0;
    this.listeners = new Map();
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

    this.bindActiveQueueEvents();

    if (!this.isSettingUpSync) {
      this.setupStoreSync();
    }
  }

  getActiveQueue(): PlayerQueue {
    if (this.queues.length === 0) {
      this.queues.push(new PlayerQueue());
      this.activeQueueIndex = 0;
    }
    return this.queues[this.activeQueueIndex];
  }

  getQueues(): PlayerQueue[] {
    return this.queues;
  }

  createQueue(name?: string, songIds: number[] = []): PlayerQueue {
    const newQueue = new PlayerQueue(songIds, 0, undefined, { title: name || `Queue ${this.queues.length + 1}` });
    this.queues.push(newQueue);
    this.emit('queuesChanged');
    this.triggerStoreSync();
    return newQueue;
  }

  switchQueue(index: number) {
    if (index >= 0 && index < this.queues.length && index !== this.activeQueueIndex) {
      this.activeQueueIndex = index;
      this.bindActiveQueueEvents();
      this.emit('activeQueueChanged');
      this.triggerStoreSync();
    }
  }

  deleteQueue(index: number) {
    if (index >= 0 && index < this.queues.length) {
      this.queues.splice(index, 1);

      if (this.queues.length === 0) {
        this.queues.push(new PlayerQueue());
      }

      let activeQueueChanged = false;

      if (this.activeQueueIndex >= this.queues.length) {
        this.activeQueueIndex = this.queues.length - 1;
        activeQueueChanged = true;
      } else if (index < this.activeQueueIndex) {
        this.activeQueueIndex -= 1;
      } else if (index === this.activeQueueIndex) {
        activeQueueChanged = true;
      }

      this.bindActiveQueueEvents();
      this.emit('queuesChanged');
      
      if (activeQueueChanged) {
        this.emit('activeQueueChanged');
      }

      this.triggerStoreSync();
    }
  }

  renameQueue(index: number, newName: string) {
    if (index >= 0 && index < this.queues.length) {
      const queue = this.queues[index];
      const metadata = queue.getMetadata();
      const updatedMetadata = { ...metadata, title: newName };
      queue.setMetadata(updatedMetadata.queueId, updatedMetadata.queueType, updatedMetadata.title);
      this.emit('queuesChanged');
      this.triggerStoreSync();
    }
  }

  reorderQueues(startIndex: number, endIndex: number) {
    if (
      startIndex >= 0 && startIndex < this.queues.length &&
      endIndex >= 0 && endIndex < this.queues.length &&
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

      this.emit('queuesChanged');
      this.triggerStoreSync();
    }
  }

  private bindActiveQueueEvents() {
    this.activeQueueUnsubscribe.forEach((unsub) => unsub());
    this.activeQueueUnsubscribe = [];

    const queue = this.getActiveQueue();

    const onChange = () => {
      this.triggerStoreSync();
    };

    this.activeQueueUnsubscribe.push(queue.on('queueChange', onChange));
    this.activeQueueUnsubscribe.push(queue.on('positionChange', onChange));
  }

  private triggerStoreSync() {
    if (this.isSyncingFromStore) return;

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

    storage.queue.setQueue({
      queues: this.queues.map((q) => q.toJSON()),
      currentQueueIndex: this.activeQueueIndex
    });
  }

  private setupStoreSync() {
    if (this.isSettingUpSync) return;
    this.isSettingUpSync = true;

    store.subscribe((state) => {
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
          if (this.queues[i].metadata?.queueId !== storeQueuesState.queues[i].metadata?.queueId) {
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
          if (
            JSON.stringify(q.getAllSongIds()) !== JSON.stringify(sq.songIds) ||
            q.position !== sq.position ||
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
              q.removeAllListeners();
            });

            this.queues = storeQueuesState.queues.map((qState) => {
              return PlayerQueue.fromJSON(qState);
            });
            this.activeQueueIndex = storeQueuesState.currentQueueIndex;
            this.bindActiveQueueEvents();
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

              if (
                JSON.stringify(q.getAllSongIds()) !== JSON.stringify(sq.songIds) ||
                q.position !== sq.position ||
                !!q.queueBeforeShuffle !== !!sq.queueBeforeShuffle
              ) {
                q.replaceQueue(sq.songIds, sq.position ?? 0, false, sq.metadata);
                q.queueBeforeShuffle = sq.queueBeforeShuffle;
              }
            }
            if (indexChanged) {
              this.activeQueueIndex = storeQueuesState.currentQueueIndex;
              this.bindActiveQueueEvents();
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
    this.activeQueueUnsubscribe.forEach((unsub) => unsub());
    this.activeQueueUnsubscribe = [];
  }
}

let managerInstance: QueuesManager | null = null;

export function initializeQueuesManager(): QueuesManager {
  if (managerInstance) return managerInstance;
  managerInstance = new QueuesManager();
  managerInstance.initialize();
  return managerInstance;
}

export function getQueuesManager(): QueuesManager {
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
}
