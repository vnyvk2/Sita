export interface ScrollPositionEntry {
  index: number;
  offset?: number;
}

export class ScrollRegistry {
  private readonly maxEntries: number;
  private positions = new Map<string, ScrollPositionEntry>();

  constructor(maxEntries = 500) {
    this.maxEntries = maxEntries;
  }

  /**
   * Retrieves the stored scroll position for a dataset key. Accessing a key promotes it to the Most
   * Recently Used (MRU) position in the LRU cache.
   */
  public get(key: string): ScrollPositionEntry | undefined {
    const entry = this.positions.get(key);
    if (entry) {
      // Re-insert to refresh recency in Map insertion order
      this.positions.delete(key);
      this.positions.set(key, entry);
    }
    return entry;
  }

  /** Convenience helper to retrieve just the item index for a dataset key. */
  public getIndex(key: string): number | undefined {
    return this.get(key)?.index;
  }

  /**
   * Stores or updates the scroll position for a dataset key. If capacity exceeds maxEntries, evicts
   * the Least Recently Used (LRU) entry.
   */
  public set(key: string, position: ScrollPositionEntry): void {
    if (this.positions.has(key)) {
      this.positions.delete(key);
    } else if (this.positions.size >= this.maxEntries) {
      const oldestKey = this.positions.keys().next().value;
      if (oldestKey !== undefined) {
        this.positions.delete(oldestKey);
      }
    }
    this.positions.set(key, position);
  }

  /** Removes a specific dataset scroll entry. */
  public clear(key: string): void {
    this.positions.delete(key);
  }

  /** Clears all stored scroll positions. */
  public clearAll(): void {
    this.positions.clear();
  }

  /** Current number of stored scroll positions. */
  public get size(): number {
    return this.positions.size;
  }
}

export const scrollRegistry = new ScrollRegistry();
