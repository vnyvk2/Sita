import { store } from '../store/store';
import storage from '../utils/localStorage';
import { getLibraryVersion } from './libraryVersion';
import PlayerQueue from './playerQueue';

export type QueuesManagerEvent = 'activeQueueChanged' | 'queuesChanged';
type QueuesManagerCallback = () => void;

export interface CanonicalQueueRequestOptions {
  /**
   * Fresh projection of the All Songs view (library IDs minus blacklisted songs). Required to
   * create or rebuild the canonical queue; optional for pure navigation requests.
   */
  songIds?: number[];
  /** Song ID to jump to after resolution. Defaults to the start of the queue. */
  startSongId?: number;
  /** Re-permute the canonical queue (Shuffle And Play). */
  shuffle?: boolean;
  /** Localized title used when the canonical queue has to be created. */
  title?: string;
  /**
   * Sort order the caller's `songIds` are arranged in. A mismatch against the stored projection
   * triggers an in-place reorder — except while the queue is shuffled, where source order is
   * irrelevant to playback order.
   */
  sortingOrder?: string;
  /**
   * Library version the caller's `songIds` were actually derived from (data provenance). The
   * manager stamps THIS value instead of the live counter, so a request served from a
   * not-yet-refetched React Query cache during a library-update race stays honestly "stale" and
   * self-heals on the next request instead of being poisoned as fresh.
   */
  builtAtLibraryVersion?: number;
}

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
  /** Queue IDs whose in-flight queueChange is a manager-initiated canonical refresh, not a user edit */
  private canonicalRefreshInFlight: Set<string>;
  /** Queue IDs whose next queueChange is the synchronous side effect of shuffle/restore */
  private shuffleSideEffectGuards: Set<string>;

  constructor() {
    this.queues = [];
    this.activeQueueIndex = 0;
    this.listeners = new Map();
    this.queueListeners = new Map();
    this.lastSyncedStructureVersions = new Map();
    this.canonicalRefreshInFlight = new Set();
    this.shuffleSideEffectGuards = new Set();
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

    this.enforceSingleCanonicalQueue();

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

  /** Returns the single canonical All Songs queue, if one exists (Invariant 1 lookup). */
  findCanonicalQueue(): PlayerQueue | undefined {
    return this.queues.find((q) => {
      const metadata = q.getMetadata();
      return metadata.queueType === 'songs' && !!metadata.isCanonical;
    });
  }

  /**
   * Single entry point for unfiltered All Songs playback requests. Resolves to the canonical queue
   * per docs/canonical-queue-architecture.md:
   *
   * - No canonical queue → create from `songIds`, tag it canonical, activate
   * - Fresh + active + sort unchanged (or shuffled) → fast path: navigation only, zero churn
   * - Stale and/or inactive and/or reordered source → rebuild the projection in place
   *
   * The caller is responsible for actually starting audio playback with the returned queue's
   * `currentSongId`; this method only mutates queue-domain state.
   */
  getOrCreateCanonicalQueue(options: CanonicalQueueRequestOptions = {}): PlayerQueue | undefined {
    const currentLibraryVersion = getLibraryVersion();
    // Stamp data provenance, not the live counter — see builtAtLibraryVersion option docs.
    const attestedVersion = options.builtAtLibraryVersion ?? currentLibraryVersion;
    const requestIds = options.songIds && options.songIds.length > 0 ? options.songIds : undefined;

    let queue = this.findCanonicalQueue();

    if (!queue) {
      if (!requestIds) return undefined;
      const title = options.title || 'All Songs';
      queue = this.createQueue(title, requestIds);
      // Suppress the structural-edit detach: this creation IS the canonical projection.
      this.canonicalRefreshInFlight.add(queue.id);
      try {
        queue.setMetadata({
          queueType: 'songs',
          isCanonical: true,
          builtAtLibraryVersion: attestedVersion,
          sortingOrder: options.sortingOrder,
          title
        });
      } finally {
        this.canonicalRefreshInFlight.delete(queue.id);
      }
    }

    const queueIndex = this.queues.indexOf(queue);
    if (queueIndex === -1) return undefined;

    const metadata = queue.getMetadata();
    const isStale = metadata.builtAtLibraryVersion !== currentLibraryVersion;
    // A stored projection without a sort stamp (legacy state) adopts the incoming sort silently.
    const sortChanged =
      metadata.sortingOrder !== undefined &&
      options.sortingOrder !== undefined &&
      metadata.sortingOrder !== options.sortingOrder;
    // While shuffled, playback order is the permutation; source order is irrelevant.
    const isShuffled = !!queue.queueBeforeShuffle;
    const isActive = this.activeQueueIndex === queueIndex;
    const targetPosition =
      options.startSongId !== undefined ? queue.getPositionOfSongId(options.startSongId) : -1;

    if (options.shuffle) {
      if (requestIds && (isStale || !isActive)) {
        this.rebuildCanonicalProjection(
          queue,
          requestIds,
          attestedVersion,
          0,
          options.sortingOrder
        );
      }
      queue.shuffle();
    } else if (
      isActive &&
      !isStale &&
      (!sortChanged || isShuffled) &&
      (options.startSongId === undefined || targetPosition >= 0)
    ) {
      // Fast path: pure position change; preserves shuffle permutation and structure version.
      // Metadata is intentionally untouched so a later un-shuffled click performs one honest
      // reorder instead of claiming the old arrangement matches the new sort.
      if (targetPosition >= 0) {
        queue.moveToPosition(targetPosition);
      } else {
        queue.moveToStart();
      }
    } else if (requestIds) {
      this.rebuildCanonicalProjection(
        queue,
        requestIds,
        attestedVersion,
        targetPosition,
        options.sortingOrder
      );
    } else if (targetPosition >= 0) {
      queue.moveToPosition(targetPosition);
    }

    const activatedIndex = this.queues.indexOf(queue);
    if (this.activeQueueIndex !== activatedIndex) {
      this.switchQueue(activatedIndex);
    }

    return queue;
  }

  /**
   * Demotes a canonical queue to a normal contextual queue (Invariant 4). The queue keeps all of
   * its content — including the user's edits — and is renamed to a free "Queue N" title so tabs
   * stay unambiguous once a new canonical queue appears.
   */
  detachCanonicalQueue(queueId: string): boolean {
    const queue = this.queues.find((q) => q.id === queueId);
    if (!queue || !queue.getMetadata().isCanonical) return false;

    let candidate = this.queues.length + 1;
    const takenTitles = new Set(this.queues.map((q) => q.getMetadata().title));
    while (takenTitles.has(`Queue ${candidate}`)) {
      candidate += 1;
    }

    this.canonicalRefreshInFlight.add(queue.id);
    try {
      queue.setMetadata({
        isCanonical: false,
        builtAtLibraryVersion: undefined,
        sortingOrder: undefined,
        title: `Queue ${candidate}`
      });
    } finally {
      this.canonicalRefreshInFlight.delete(queue.id);
    }

    this.triggerStoreSync();
    this.emit('queuesChanged');
    return true;
  }

  private rebuildCanonicalProjection(
    queue: PlayerQueue,
    songIds: number[],
    libraryVersion: number,
    targetPosition = 0,
    sortingOrder?: string
  ): void {
    this.canonicalRefreshInFlight.add(queue.id);
    try {
      queue.replaceQueue(songIds, Math.max(0, targetPosition), true, {
        ...queue.getMetadata(),
        isCanonical: true,
        builtAtLibraryVersion: libraryVersion,
        ...(sortingOrder !== undefined ? { sortingOrder } : {})
      });
    } finally {
      this.canonicalRefreshInFlight.delete(queue.id);
    }
  }

  /**
   * Boot-time guard for corrupted/hand-edited persisted state: demote every canonical-marked queue
   * beyond the first so Invariant 1 holds from startup.
   */
  private enforceSingleCanonicalQueue(): void {
    let seenCanonical = false;
    for (const q of this.queues) {
      const metadata = q.getMetadata();
      if (!(metadata.queueType === 'songs' && metadata.isCanonical)) continue;
      if (!seenCanonical) {
        seenCanonical = true;
        continue;
      }
      q.setMetadata({ isCanonical: false });
    }
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
        // 'shuffled'/'restored' fire synchronously right before their queueChange; those are
        // playback-state changes, not structural edits (docs/canonical-queue-architecture.md,
        // Invariant 4).
        if (this.shuffleSideEffectGuards.has(queue.id)) {
          this.shuffleSideEffectGuards.delete(queue.id);
        } else {
          this.detachCanonicalQueueOnStructuralEdit(queue);
        }
        this.triggerStoreSync();
      }),
      queue.on('shuffled', () => this.markShuffleSideEffect(queue.id)),
      queue.on('restored', () => this.markShuffleSideEffect(queue.id)),
      queue.on('positionChange', () => {
        this.triggerStoreSync();
      }),
      queue.on('metadataChange', () => {
        this.triggerStoreSync();
      })
    ];

    this.queueListeners.set(queue.id, unsubs);
  }

  private markShuffleSideEffect(queueId: string): void {
    this.shuffleSideEffectGuards.add(queueId);
    queueMicrotask(() => this.shuffleSideEffectGuards.delete(queueId));
  }

  private detachCanonicalQueueOnStructuralEdit(queue: PlayerQueue): void {
    if (this.isSyncingFromStore) return;
    if (this.canonicalRefreshInFlight.has(queue.id)) return;
    if (!queue.getMetadata().isCanonical) return;
    this.detachCanonicalQueue(queue.id);
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
              const songIdsChanged = hasStructureVersionChanged;
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
