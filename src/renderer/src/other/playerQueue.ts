const DEBUG_PLAYER_QUEUE = false;

const logQueue = (...args: unknown[]) => {
  if (!DEBUG_PLAYER_QUEUE) return;
  console.debug(...args);
};

/*
    Represents a queue of songs to be played in the music player.
*/
class PlayerQueue {
  id: string;
  songIds: number[];
  position: number;
  queueBeforeShuffle?: number[];
  metadata?: PlayerQueueMetadata;
  private _structureVersion = 0;
  private _membershipVersion = 0;
  private listeners: Map<QueueEventType, Set<QueueEventCallback<unknown>>>;

  constructor(
    songIds: number[] = [],
    position = 0,
    queueBeforeShuffle?: number[],
    metadata?: PlayerQueueMetadata,
    id?: string
  ) {
    this.id =
      id ||
      (globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `queue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`);
    this.songIds = songIds;
    this.position = position;
    this.metadata = metadata;
    this.queueBeforeShuffle = queueBeforeShuffle;
    this._structureVersion = 0;
    this._membershipVersion = 0;
    this.listeners = new Map();
  }

  get structureVersion(): number {
    return this._structureVersion;
  }

  private incrementStructureVersion(): void {
    this._structureVersion = (this._structureVersion + 1) | 0;
  }

  get membershipVersion(): number {
    return this._membershipVersion;
  }

  private incrementMembershipVersion(): void {
    this._membershipVersion = (this._membershipVersion + 1) | 0;
  }

  get currentSongId(): number | null {
    return this.songIds[this.position] || null;
  }

  set currentSongId(songId: number) {
    const index = this.songIds.indexOf(songId);
    if (index !== -1) {
      this.position = index;
    } else {
      this.songIds.push(songId);
      this.position = this.songIds.length - 1;
      this.queueBeforeShuffle = undefined;
      this.incrementStructureVersion();
      this.incrementMembershipVersion();
    }
  }

  get length(): number {
    return this.songIds.length;
  }

  get isEmpty(): boolean {
    return this.songIds.length === 0;
  }

  get hasNext(): boolean {
    return this.position < this.songIds.length - 1;
  }

  get hasPrevious(): boolean {
    return this.position > 0;
  }

  get nextSongId(): number | null {
    return this.songIds[this.position + 1] || null;
  }

  get previousSongId(): number | null {
    return this.songIds[this.position - 1] || null;
  }

  get isAtStart(): boolean {
    return this.position === 0;
  }

  get isAtEnd(): boolean {
    return this.position === this.songIds.length - 1;
  }

  /**
   * Emits an event to all registered listeners
   *
   * @param eventType - The type of event to emit
   * @param data - The data to pass to the listeners
   */
  private emit<K extends QueueEventType>(eventType: K, data: QueueEventData[K]): void {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      eventListeners.forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in queue event listener for ${eventType}:`, error);
        }
      });
    }
  }

  /**
   * Registers a callback for a specific queue event
   *
   * @param eventType - The type of event to listen for
   * @param callback - The callback function to execute when the event occurs
   * @returns A function to unregister the listener
   */
  on<K extends QueueEventType>(
    eventType: K,
    callback: QueueEventCallback<QueueEventData[K]>
  ): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }

    const eventListeners = this.listeners.get(eventType)!;
    eventListeners.add(callback as QueueEventCallback<unknown>);

    // Return unsubscribe function
    return () => {
      eventListeners.delete(callback as QueueEventCallback<unknown>);
      if (eventListeners.size === 0) {
        this.listeners.delete(eventType);
      }
    };
  }

  /**
   * Removes a specific callback for an event type
   *
   * @param eventType - The type of event
   * @param callback - The callback to remove
   */
  off<K extends QueueEventType>(
    eventType: K,
    callback: QueueEventCallback<QueueEventData[K]>
  ): void {
    const eventListeners = this.listeners.get(eventType);
    if (eventListeners) {
      eventListeners.delete(callback as QueueEventCallback<unknown>);
      if (eventListeners.size === 0) {
        this.listeners.delete(eventType);
      }
    }
  }

  /**
   * Removes all listeners for a specific event type or all events
   *
   * @param eventType - Optional event type to clear. If not provided, clears all listeners
   */
  removeAllListeners(eventType?: QueueEventType): void {
    if (eventType) {
      this.listeners.delete(eventType);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Moves to the next song in the queue
   *
   * @returns True if moved successfully, false if at the end
   */
  moveToNext(): boolean {
    if (this.hasNext) {
      const oldPosition = this.position;
      this.position += 1;
      logQueue('[PlayerQueue.moveToNext]', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId,
        queueLength: this.songIds.length
      });
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
      return true;
    }
    logQueue('[PlayerQueue.moveToNext] Already at end, position:', this.position);
    return false;
  }

  /**
   * Moves to the previous song in the queue
   *
   * @returns True if moved successfully, false if at the start
   */
  moveToPrevious(): boolean {
    if (this.hasPrevious) {
      const oldPosition = this.position;
      this.position -= 1;
      logQueue('[PlayerQueue.moveToPrevious]', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId,
        queueLength: this.songIds.length
      });
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
      return true;
    }
    logQueue('[PlayerQueue.moveToPrevious] Already at start, position:', this.position);
    return false;
  }

  /** Moves to the first song in the queue */
  moveToStart(): void {
    const oldPosition = this.position;
    this.position = 0;
    logQueue('[PlayerQueue.moveToStart]', {
      oldPosition,
      newPosition: this.position,
      currentSongId: this.currentSongId,
      queueLength: this.songIds.length
    });
    if (oldPosition !== this.position) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }
  }

  /** Moves to the last song in the queue */
  moveToEnd(): void {
    const oldPosition = this.position;
    if (this.songIds.length > 0) {
      this.position = this.songIds.length - 1;
    }
    if (oldPosition !== this.position) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }
  }

  /**
   * Moves to a specific position in the queue
   *
   * @param position - The target position (0-indexed)
   * @returns True if position is valid and moved successfully
   */
  moveToPosition(position: number): boolean {
    if (position >= 0 && position < this.songIds.length) {
      const oldPosition = this.position;
      this.position = position;
      logQueue('[PlayerQueue.moveToPosition]', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId,
        queueLength: this.songIds.length
      });
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
      return true;
    }
    logQueue('[PlayerQueue.moveToPosition] Invalid position:', {
      requestedPosition: position,
      currentPosition: this.position,
      queueLength: this.songIds.length
    });
    return false;
  }

  /**
   * Adds song IDs to the next position in the queue
   *
   * @param songIds - Array of song IDs to add
   */
  addSongIdsToNext(songIds: number[]): void {
    if (songIds.length === 0) return;
    this.queueBeforeShuffle = undefined;
    this.incrementStructureVersion();
    this.incrementMembershipVersion();
    logQueue('[PlayerQueue.addSongIdsToNext]', {
      addingCount: songIds.length,
      currentPosition: this.position,
      insertPosition: this.position + 1,
      queueLengthBefore: this.songIds.length
    });
    this.songIds.splice(this.position + 1, 0, ...songIds);
    songIds.forEach((songId, index) => {
      this.emit('songAdded', { songId, position: this.position + 1 + index });
    });
    logQueue('[PlayerQueue.addSongIdsToNext.done]', {
      addedCount: songIds.length,
      queueLengthAfter: this.songIds.length
    });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
  }

  /**
   * Adds song IDs to the end of the queue
   *
   * @param songIds - Array of song IDs to add
   */
  addSongIdsToEnd(songIds: number[]): void {
    if (songIds.length === 0) return;
    this.queueBeforeShuffle = undefined;
    this.incrementStructureVersion();
    this.incrementMembershipVersion();
    logQueue('[PlayerQueue.addSongIdsToEnd]', {
      addingCount: songIds.length,
      currentPosition: this.position,
      queueLengthBefore: this.songIds.length
    });
    const startPosition = this.songIds.length;
    this.songIds.push(...songIds);
    songIds.forEach((songId, index) => {
      this.emit('songAdded', { songId, position: startPosition + index });
    });
    logQueue('[PlayerQueue.addSongIdsToEnd.done]', {
      addedCount: songIds.length,
      queueLengthAfter: this.songIds.length
    });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
  }

  /**
   * Adds a single song ID to the next position
   *
   * @param songId - Song ID to add
   */
  addSongIdToNext(songId: number): void {
    this.queueBeforeShuffle = undefined;
    this.incrementStructureVersion();
    this.incrementMembershipVersion();
    this.songIds.splice(this.position + 1, 0, songId);
    this.emit('songAdded', { songId, position: this.position + 1 });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
  }

  /**
   * Adds songs to play next, atomically removing any existing duplicate occurrences of those songs
   * from the queue, inserting the incoming batch after the current position, and adjusting
   * playback position in a single atomic O(N) mutation.
   *
   * Only increments membershipVersion if new song IDs were introduced to the queue or existing
   * duplicate multiplicities changed. If playNext only reorders songs already present in the queue,
   * membershipVersion remains unchanged (0 IPC / 0 DB query refetch).
   *
   * @param songIds - A single song ID or array of song IDs to play next
   */
  playNext(songIds: number | number[]): void {
    const ids = Array.isArray(songIds) ? songIds : [songIds];
    if (ids.length === 0) return;

    this.queueBeforeShuffle = undefined;

    if (this.songIds.length === 0) {
      this.songIds = [...ids];
      this.position = 0;
      this.incrementStructureVersion();
      this.incrementMembershipVersion();
      this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
      return;
    }

    const removalSet = new Set(ids);
    const incomingCounts = new Map<number, number>();
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      incomingCounts.set(id, (incomingCounts.get(id) || 0) + 1);
    }

    const removedCounts = new Map<number, number>();
    const newSongIds: number[] = [];
    let removedBeforeCurrent = 0;
    let currentWasRemoved = false;

    for (let i = 0; i < this.songIds.length; i += 1) {
      const id = this.songIds[i];
      if (removalSet.has(id)) {
        removedCounts.set(id, (removedCounts.get(id) || 0) + 1);
        if (i < this.position) {
          removedBeforeCurrent += 1;
        }
        if (i === this.position) {
          currentWasRemoved = true;
        }
      } else {
        newSongIds.push(id);
      }
    }

    // Determine if membership changed (i.e. new song IDs added or duplicate counts differed)
    let membershipChanged = incomingCounts.size !== removedCounts.size;
    if (!membershipChanged) {
      for (const [id, count] of incomingCounts) {
        if (removedCounts.get(id) !== count) {
          membershipChanged = true;
          break;
        }
      }
    }

    let newPosition = 0;
    if (newSongIds.length === 0) {
      newSongIds.push(...ids);
      newPosition = 0;
    } else {
      if (currentWasRemoved) {
        newPosition = Math.max(0, Math.min(this.position - removedBeforeCurrent, newSongIds.length - 1));
      } else {
        newPosition = this.position - removedBeforeCurrent;
      }
      newSongIds.splice(newPosition + 1, 0, ...ids);
    }

    const oldPosition = this.position;
    this.songIds = newSongIds;
    this.position = newPosition;

    this.incrementStructureVersion();
    if (membershipChanged) {
      this.incrementMembershipVersion();
    }

    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
    if (oldPosition !== newPosition || currentWasRemoved) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }
  }

  /**
   * Removes multiple songs from the queue by their positions in a single O(N) pass
   *
   * @param positions - Set or Array of 0-indexed positions to remove
   * @returns True if at least one song was removed, false otherwise
   */
  removeSongsAtPositions(positions: Set<number> | number[] | Iterable<number>): boolean {
    if (this.songIds.length === 0) return false;
    const positionsSet = positions instanceof Set ? positions : new Set(positions);
    if (positionsSet.size === 0) return false;

    const newSongIds: number[] = [];
    let removedBeforeCurrent = 0;
    let currentWasRemoved = false;
    let removedAny = false;

    for (let i = 0; i < this.songIds.length; i += 1) {
      if (positionsSet.has(i)) {
        removedAny = true;
        if (i < this.position) {
          removedBeforeCurrent += 1;
        }
        if (i === this.position) {
          currentWasRemoved = true;
        }
      } else {
        newSongIds.push(this.songIds[i]);
      }
    }

    if (!removedAny) return false;

    this.queueBeforeShuffle = undefined;
    this.incrementStructureVersion();
    this.incrementMembershipVersion();

    const oldPosition = this.position;
    let newPosition = 0;
    if (newSongIds.length > 0) {
      if (currentWasRemoved) {
        newPosition = Math.max(0, Math.min(this.position - removedBeforeCurrent, newSongIds.length - 1));
      } else {
        newPosition = this.position - removedBeforeCurrent;
      }
    }

    this.songIds = newSongIds;
    this.position = newPosition;

    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
    if (oldPosition !== newPosition || currentWasRemoved) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }

    return true;
  }

  /**
   * Removes multiple songs from the queue by their song IDs in a single O(N) pass,
   * removing all duplicate occurrences of those IDs.
   *
   * @param songIds - Set or Array of song IDs to remove
   * @returns True if at least one song was removed, false otherwise
   */
  removeSongIds(songIds: Set<number> | number[] | Iterable<number>): boolean {
    if (this.songIds.length === 0) return false;
    const idsSet = songIds instanceof Set ? songIds : new Set(songIds);
    if (idsSet.size === 0) return false;

    const newSongIds: number[] = [];
    let removedBeforeCurrent = 0;
    let currentWasRemoved = false;
    let removedAny = false;

    for (let i = 0; i < this.songIds.length; i += 1) {
      const id = this.songIds[i];
      if (idsSet.has(id)) {
        removedAny = true;
        if (i < this.position) {
          removedBeforeCurrent += 1;
        }
        if (i === this.position) {
          currentWasRemoved = true;
        }
      } else {
        newSongIds.push(id);
      }
    }

    if (!removedAny) return false;

    this.queueBeforeShuffle = undefined;
    this.incrementStructureVersion();
    this.incrementMembershipVersion();

    const oldPosition = this.position;
    let newPosition = 0;
    if (newSongIds.length > 0) {
      if (currentWasRemoved) {
        newPosition = Math.max(0, Math.min(this.position - removedBeforeCurrent, newSongIds.length - 1));
      } else {
        newPosition = this.position - removedBeforeCurrent;
      }
    }

    this.songIds = newSongIds;
    this.position = newPosition;

    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
    if (oldPosition !== newPosition || currentWasRemoved) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }

    return true;
  }

  /**
   * Adds a single song ID to the end of the queue
   *
   * @param songId - Song ID to add
   */
  addSongIdToEnd(songId: number): void {
    this.queueBeforeShuffle = undefined;
    this.incrementStructureVersion();
    this.incrementMembershipVersion();
    const position = this.songIds.length;
    this.songIds.push(songId);
    this.emit('songAdded', { songId, position });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
  }

  /**
   * Removes a song from the queue by ID
   *
   * @param songId - Song ID to remove
   * @returns True if removed successfully, false if not found
   */
  removeSongId(songId: number): boolean {
    const index = this.songIds.indexOf(songId);
    logQueue('[PlayerQueue.removeSongId]', {
      songId,
      foundAtIndex: index,
      currentPosition: this.position,
      queueLengthBefore: this.songIds.length
    });
    if (index !== -1) {
      this.queueBeforeShuffle = undefined;
      this.incrementStructureVersion();
      this.incrementMembershipVersion();
      this.songIds.splice(index, 1);
      this.emit('songRemoved', { songId, position: index });
      logQueue('[PlayerQueue.removeSongId.removed]', {
        removedIndex: index,
        newPosition: this.position,
        queueLengthAfter: this.songIds.length
      });
      // Adjust position if necessary
      if (index < this.position) {
        const oldPosition = this.position;
        this.position -= 1;
        this.emit('positionChange', {
          oldPosition,
          newPosition: this.position,
          currentSongId: this.currentSongId
        });
      } else if (index === this.position && this.position >= this.songIds.length) {
        const oldPosition = this.position;
        this.position = Math.max(0, this.songIds.length - 1);
        this.emit('positionChange', {
          oldPosition,
          newPosition: this.position,
          currentSongId: this.currentSongId
        });
      }
      this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
      return true;
    }
    return false;
  }

  /**
   * Removes a song from the queue by position
   *
   * @param position - Position to remove (0-indexed)
   * @returns The removed song ID, or null if position is invalid
   */
  removeSongAtPosition(position: number): number | null {
    if (position >= 0 && position < this.songIds.length) {
      this.queueBeforeShuffle = undefined;
      this.incrementStructureVersion();
      this.incrementMembershipVersion();
      const [removed] = this.songIds.splice(position, 1);
      this.emit('songRemoved', { songId: removed, position });
      // Adjust current position if necessary
      if (position < this.position) {
        const oldPosition = this.position;
        this.position -= 1;
        this.emit('positionChange', {
          oldPosition,
          newPosition: this.position,
          currentSongId: this.currentSongId
        });
      } else if (position === this.position && this.position >= this.songIds.length) {
        const oldPosition = this.position;
        this.position = Math.max(0, this.songIds.length - 1);
        this.emit('positionChange', {
          oldPosition,
          newPosition: this.position,
          currentSongId: this.currentSongId
        });
      }
      this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
      return removed;
    }
    return null;
  }

  /** Clears all songs from the queue */
  clear(): void {
    logQueue('[PlayerQueue.clear]', {
      queueLengthBefore: this.songIds.length,
      currentPosition: this.position
    });
    if (this.songIds.length > 0) {
      this.incrementMembershipVersion();
    }
    this.songIds = [];
    this.incrementStructureVersion();
    const oldPosition = this.position;
    this.position = 0;
    this.queueBeforeShuffle = undefined;
    this.emit('queueCleared', {});
    this.emit('queueChange', { queue: [], length: 0 });
    logQueue('[PlayerQueue.clear.done]', {
      queueLengthAfter: this.songIds.length,
      position: this.position
    });
    if (oldPosition !== 0) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: 0,
        currentSongId: null
      });
    }
  }

  /**
   * Replaces the entire queue with new song IDs
   *
   * @param songIds - New array of song IDs
   * @param newPosition - Optional new position (defaults to 0)
   * @param clearShuffleHistory - Whether to clear shuffle history (defaults to true)
   * @param metadata - Optional queue metadata to set
   */
  replaceQueue(
    songIds: number[],
    newPosition = 0,
    clearShuffleHistory = true,
    metadata?: PlayerQueueMetadata
  ): void {
    logQueue('[PlayerQueue.replaceQueue]', {
      newQueueLength: songIds.length,
      newPosition,
      oldQueueLength: this.songIds.length,
      oldPosition: this.position,
      hasMetadata: metadata !== undefined
    });
    const oldQueue = [...this.songIds];
    const oldPosition = this.position;
    const oldMetadata = this.metadata;

    // Check if membership set changed (order changes do NOT increment membershipVersion)
    let membershipChanged = oldQueue.length !== songIds.length;
    if (!membershipChanged) {
      const counts = new Map<number, number>();
      for (let i = 0; i < oldQueue.length; i++) {
        const id = oldQueue[i];
        counts.set(id, (counts.get(id) || 0) + 1);
      }
      for (let i = 0; i < songIds.length; i++) {
        const id = songIds[i];
        const count = counts.get(id);
        if (!count) {
          membershipChanged = true;
          break;
        }
        if (count === 1) counts.delete(id);
        else counts.set(id, count - 1);
      }
      if (counts.size > 0) membershipChanged = true;
    }

    this.songIds = [...songIds];
    this.incrementStructureVersion();
    if (membershipChanged) {
      this.incrementMembershipVersion();
    }
    this.position = newPosition >= 0 && newPosition < songIds.length ? newPosition : 0;
    if (clearShuffleHistory) {
      this.queueBeforeShuffle = undefined;
    }
    if (metadata !== undefined) {
      this.metadata = metadata;
    }
    logQueue('[PlayerQueue.replaceQueue.done]', {
      finalQueueLength: this.songIds.length,
      finalPosition: this.position,
      currentSongId: this.currentSongId
    });
    this.emit('queueReplaced', {
      oldQueue,
      newQueue: [...this.songIds],
      newPosition: this.position
    });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
    if (oldPosition !== this.position) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }
    if (metadata !== undefined && JSON.stringify(oldMetadata) !== JSON.stringify(metadata)) {
      this.emit('metadataChange', { queueId: metadata?.queueId, queueType: metadata?.queueType });
    }
  }

  /**
   * Shuffles the queue randomly, keeping the current song at the start
   *
   * @returns Object containing the shuffled queue and position mapping
   */
  shuffle(): { shuffledQueue: number[]; positions: number[] } {
    logQueue('[PlayerQueue.shuffle]', {
      queueLength: this.songIds.length,
      currentPosition: this.position,
      currentSongId: this.currentSongId
    });
    const initialQueue = this.songIds.slice(0);
    const initialIndices = Array.from({ length: this.songIds.length }, (_, i) => i);
    const currentSongId = this.songIds.splice(this.position, 1)[0];
    const currentSongOriginalIndex = initialIndices.splice(this.position, 1)[0];

    // Fisher-Yates shuffle both songIds and initialIndices in lockstep
    for (let i = this.songIds.length - 1; i > 0; i -= 1) {
      const randomIndex = Math.floor(Math.random() * (i + 1));
      [this.songIds[i], this.songIds[randomIndex]] = [this.songIds[randomIndex], this.songIds[i]];
      [initialIndices[i], initialIndices[randomIndex]] = [initialIndices[randomIndex], initialIndices[i]];
    }

    // Place current song at the beginning
    if (currentSongId !== undefined) {
      this.songIds.unshift(currentSongId);
      initialIndices.unshift(currentSongOriginalIndex);
    }

    // Create O(N) position mapping: positions[originalIndex] = shuffledIndex
    const positions = new Array<number>(initialQueue.length);
    for (let j = 0; j < initialIndices.length; j += 1) {
      positions[initialIndices[j]] = j;
    }

    const oldPosition = this.position;
    this.position = 0;
    this.queueBeforeShuffle = positions;
    this.incrementStructureVersion();

    logQueue('[PlayerQueue.shuffle.done]', {
      newQueueLength: this.songIds.length,
      newPosition: this.position
    });

    this.emit('shuffled', {
      originalQueue: initialQueue,
      shuffledQueue: [...this.songIds],
      positions
    });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
    if (oldPosition !== 0) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: 0,
        currentSongId: this.currentSongId
      });
    }

    return { shuffledQueue: this.songIds, positions };
  }

  /**
   * Restores the queue from a position mapping
   *
   * @param positionMapping - Array of positions to restore the original order
   * @param currentSongId - Optional current song ID to maintain after restore
   */
  restoreFromPositions(positionMapping: number[], currentSongId?: number): void {
    if (positionMapping.length !== this.songIds.length) {
      return;
    }

    const restoredQueue: number[] = [];
    const currentQueue = [...this.songIds];

    for (let i = 0; i < positionMapping.length; i += 1) {
      restoredQueue.push(currentQueue[positionMapping[i]]);
    }

    const oldPosition = this.position;
    this.songIds = restoredQueue;
    this.incrementStructureVersion();

    if (currentSongId) {
      const newPosition = this.songIds.indexOf(currentSongId);
      this.position = newPosition !== -1 ? newPosition : 0;
    } else {
      this.position = 0;
    }

    // Clear the shuffle history since we've restored
    this.queueBeforeShuffle = undefined;

    this.emit('restored', { restoredQueue: [...this.songIds] });
    this.emit('queueChange', { queue: [...this.songIds], length: this.songIds.length });
    if (oldPosition !== this.position) {
      this.emit('positionChange', {
        oldPosition,
        newPosition: this.position,
        currentSongId: this.currentSongId
      });
    }
  }

  /**
   * Restores the queue from the stored shuffle positions (if available)
   *
   * @param currentSongId - Optional current song ID to maintain after restore
   * @returns True if restored successfully, false if no shuffle history exists
   */
  restoreFromShuffle(currentSongId?: number): boolean {
    if (!this.queueBeforeShuffle || this.queueBeforeShuffle.length === 0) {
      return false;
    }

    this.restoreFromPositions(this.queueBeforeShuffle, currentSongId);
    return true;
  }

  /**
   * Checks if the queue has shuffle history available for restoration
   *
   * @returns True if queue can be restored from shuffle
   */
  canRestoreFromShuffle(): boolean {
    return (
      Array.isArray(this.queueBeforeShuffle) &&
      this.queueBeforeShuffle.length > 0 &&
      this.queueBeforeShuffle.length === this.songIds.length
    );
  }

  /** Clears the shuffle history without restoring the queue */
  clearShuffleHistory(): void {
    this.queueBeforeShuffle = undefined;
  }

  /**
   * Sets or updates the queue metadata
   *
   * @param updatedMetadata - Partial metadata object to merge with existing metadata
   */
  setMetadata(updatedMetadata: Partial<PlayerQueueMetadata>): void {
    this.metadata = { ...(this.metadata || {}), ...updatedMetadata };
    this.emit('metadataChange', {
      queueId: this.metadata?.queueId,
      queueType: this.metadata?.queueType
    });
  }

  /**
   * Gets the queue metadata
   *
   * @returns Object containing queueId and queueType
   */
  getMetadata(): PlayerQueueMetadata {
    return this.metadata || {};
  }

  /**
   * Gets a song ID at a specific position
   *
   * @param position - Position to get (0-indexed)
   * @returns The song ID at the position, or null if invalid
   */
  getSongIdAtPosition(position: number): number | null {
    return this.songIds[position] || null;
  }

  /**
   * Gets the position of a song ID in the queue
   *
   * @param songId - Song ID to find
   * @returns The position (0-indexed), or -1 if not found
   */
  getPositionOfSongId(songId: number): number {
    return this.songIds.indexOf(songId);
  }

  /**
   * Checks if a song ID exists in the queue
   *
   * @param songId - Song ID to check
   * @returns True if the song is in the queue
   */
  hasSongId(songId: number): boolean {
    return this.songIds.includes(songId);
  }

  /**
   * Gets a copy of all song IDs in the queue
   *
   * @returns Array of all song IDs
   */
  getAllSongIds(): number[] {
    return [...this.songIds];
  }

  /**
   * Gets remaining song IDs after the current position
   *
   * @returns Array of song IDs after current position
   */
  getRemainingSongIds(): number[] {
    return this.songIds.slice(this.position + 1);
  }

  /**
   * Gets previous song IDs before the current position
   *
   * @returns Array of song IDs before current position
   */
  getPreviousSongIds(): number[] {
    return this.songIds.slice(0, this.position);
  }

  /**
   * Creates a clone of the queue
   *
   * @returns A new PlayerQueue instance with the same data
   */
  clone(): PlayerQueue {
    return new PlayerQueue(
      [...this.songIds],
      this.position,
      this.queueBeforeShuffle ? [...this.queueBeforeShuffle] : undefined,
      this.metadata ? { ...this.metadata } : undefined,
      globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `queue-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
    );
  }

  /**
   * Converts the queue to a JSON-serializable object
   *
   * @returns Object representation of the queue
   */
  toJSON(): PlayerQueueJson {
    return {
      id: this.id,
      songIds: [...this.songIds],
      position: this.position,
      queueBeforeShuffle: this.queueBeforeShuffle ? [...this.queueBeforeShuffle] : undefined,
      metadata: this.metadata ? { ...this.metadata } : undefined
    };
  }

  /**
   * Creates a PlayerQueue instance from a JSON object
   *
   * @param json - JSON object representation of a queue
   * @returns A new PlayerQueue instance
   */
  static fromJSON(json: {
    id?: string;
    songIds: number[];
    position: number;
    queueBeforeShuffle?: number[];
    metadata?: PlayerQueueMetadata;
  }): PlayerQueue {
    return new PlayerQueue(
      json.songIds || [],
      json.position || 0,
      json.queueBeforeShuffle,
      json.metadata,
      json.id
    );
  }
}

export default PlayerQueue;
