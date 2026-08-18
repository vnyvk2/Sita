import { CachePolicy, type CachePolicyOptions } from './CachePolicy';

interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  lastAccessedAt: number;
}

export class IdentityResolutionCache {
  private readonly policy: CachePolicy;
  private readonly cache = new Map<string, CacheEntry<unknown>>();
  private accessSequence = 0;

  constructor(options?: CachePolicyOptions) {
    this.policy = new CachePolicy(options);
  }

  public get<T>(providerId: string, entityKey: string): T | undefined {
    const key = this.buildKey(providerId, entityKey);
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    const now = Date.now();
    if (now - entry.createdAt > this.policy.ttlMs) {
      this.cache.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = ++this.accessSequence;
    return entry.value as T;
  }

  public set<T>(providerId: string, entityKey: string, value: T): void {
    const key = this.buildKey(providerId, entityKey);
    const now = Date.now();
    const seq = ++this.accessSequence;

    if (this.cache.size >= this.policy.maxEntries && !this.cache.has(key)) {
      this.pruneExpired();
      if (this.cache.size >= this.policy.maxEntries && !this.cache.has(key)) {
        this.evictOne();
      }
    }

    this.cache.set(key, {
      key,
      value,
      createdAt: now,
      lastAccessedAt: seq
    });
  }

  public has(providerId: string, entityKey: string): boolean {
    return this.get(providerId, entityKey) !== undefined;
  }

  public delete(providerId: string, entityKey: string): boolean {
    const key = this.buildKey(providerId, entityKey);
    return this.cache.delete(key);
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }

  public pruneExpired(): number {
    const now = Date.now();
    let prunedCount = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.policy.ttlMs) {
        this.cache.delete(key);
        prunedCount++;
      }
    }
    return prunedCount;
  }

  private buildKey(providerId: string, entityKey: string): string {
    return `${providerId}:${entityKey}`;
  }

  private evictOne(): void {
    if (this.cache.size === 0) return;

    if (this.policy.evictionStrategy === 'lru') {
      let oldestKey: string | null = null;
      let oldestAccess = Infinity;

      for (const [key, entry] of this.cache.entries()) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = key;
        }
      }

      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    } else {
      // FIFO eviction
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
  }
}
