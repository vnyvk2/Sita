/**
 * SongMetadataCache — In-Memory Flat Projection & Metadata Cache Engine for Nora.
 *
 * Provides sub-millisecond (O(1)) resolution of lightweight flat song metadata projections
 * during fast scrolling and virtualized window hydration.
 *
 * Memory posture:
 * - Flat song metadata projection ~250 bytes per song in V8 heap.
 * - 10,000 songs = ~2.5MB RAM.
 * - 50,000 songs = ~12.5MB RAM (well below the < 25MB threshold).
 * - Bounded with LRU eviction at `maxSize` (default 50,000 items).
 */

export class SongMetadataCache {
  private cache = new Map<number, SongData>();
  private maxSize: number;

  constructor(maxSize = 50000) {
    this.maxSize = maxSize;
  }

  /**
   * Retrieves a cached flat song projection by ID, refreshing its LRU position.
   */
  get(id: number): SongData | undefined {
    const item = this.cache.get(id);
    if (item !== undefined) {
      // Refresh LRU recency
      this.cache.delete(id);
      this.cache.set(id, item);
      return item;
    }
    return undefined;
  }

  /**
   * Batch retrieval dividing requested IDs into cache hits and misses.
   */
  getMany(ids: number[]): { hits: Map<number, SongData>; misses: number[] } {
    const hits = new Map<number, SongData>();
    const misses: number[] = [];
    const seenMisses = new Set<number>();

    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i];
      const item = this.get(id);
      if (item !== undefined) {
        hits.set(id, item);
      } else if (!seenMisses.has(id)) {
        seenMisses.add(id);
        misses.push(id);
      }
    }

    return { hits, misses };
  }

  /**
   * Caches or updates a song's metadata, evicting the least recently used item if at capacity.
   */
  set(id: number, data: SongData): void {
    if (this.cache.has(id)) {
      this.cache.delete(id);
    } else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(id, data);
  }

  /**
   * Batch stores song entries into the cache.
   */
  setMany(entries: SongData[] | [number, SongData][]): void {
    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i];
      if (Array.isArray(entry)) {
        this.set(entry[0], entry[1]);
      } else if (entry && typeof entry.songId === 'number') {
        this.set(entry.songId, entry);
      }
    }
  }

  /**
   * Removes a song from the cache by ID.
   */
  invalidate(id: number): void {
    this.cache.delete(id);
  }

  /**
   * Batch invalidates multiple song IDs.
   */
  invalidateMany(ids: number[]): void {
    for (let i = 0; i < ids.length; i += 1) {
      this.cache.delete(ids[i]);
    }
  }

  /**
   * Synchronously updates the favorite status of a cached song without re-fetching.
   */
  updateFavorite(id: number, isFavorite: boolean): void {
    const existing = this.cache.get(id);
    if (existing) {
      existing.isAFavorite = isFavorite;
    }
  }

  /**
   * Synchronously updates favorite statuses for a list of song IDs.
   */
  updateFavoriteMany(ids: number[], isFavorite: boolean): void {
    for (let i = 0; i < ids.length; i += 1) {
      this.updateFavorite(ids[i], isFavorite);
    }
  }

  /**
   * Updates partial metadata fields for a cached song.
   */
  update(id: number, updater: (prev: SongData) => SongData | Partial<SongData>): void {
    const existing = this.cache.get(id);
    if (existing) {
      const updated = updater(existing);
      Object.assign(existing, updated);
    }
  }

  /**
   * Clears the entire cache.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Current number of cached song projections.
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Returns true if the song ID is in the cache.
   */
  has(id: number): boolean {
    return this.cache.has(id);
  }
}

export const songMetadataCache = new SongMetadataCache();
export default songMetadataCache;
