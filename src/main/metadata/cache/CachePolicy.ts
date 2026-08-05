export interface CachePolicyOptions {
  ttlMs?: number;
  maxEntries?: number;
  evictionStrategy?: 'lru' | 'fifo';
}

export class CachePolicy {
  public readonly ttlMs: number;
  public readonly maxEntries: number;
  public readonly evictionStrategy: 'lru' | 'fifo';

  constructor(options?: CachePolicyOptions) {
    this.ttlMs = options?.ttlMs ?? 1000 * 60 * 60 * 24; // Default 24 hours
    this.maxEntries = options?.maxEntries ?? 10000;
    this.evictionStrategy = options?.evictionStrategy ?? 'lru';
  }
}
