import type { MetadataEntity } from '../models/MetadataEntity';
import type { MetadataIdentity } from '../models/MetadataIdentity';
import type { MetadataKind } from '../models/MetadataKind';

export interface MetadataCacheOptions {
  maxEntries?: number;
}

export class MetadataCache {
  private readonly cache: Map<string, MetadataEntity> = new Map();
  private readonly maxEntries: number;

  constructor(options: MetadataCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 1000;
  }

  public get(identity: MetadataIdentity): MetadataEntity | undefined {
    const key = identity.metadataId;
    const item = this.cache.get(key);
    if (item) {
      // LRU refresh position
      this.cache.delete(key);
      this.cache.set(key, item);
    }
    return item;
  }

  public set(entity: MetadataEntity): void {
    const key = entity.identity.metadataId;
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxEntries) {
      // Evict oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(key, entity);
  }

  public delete(identity: MetadataIdentity): boolean {
    return this.cache.delete(identity.metadataId);
  }

  public invalidateKind(kind: MetadataKind): void {
    for (const [key, entity] of this.cache.entries()) {
      if (entity.kind === kind) {
        this.cache.delete(key);
      }
    }
  }

  public clear(): void {
    this.cache.clear();
  }

  public size(): number {
    return this.cache.size;
  }
}
