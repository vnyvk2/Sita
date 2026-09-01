import { MetadataCache } from '@main/metadata/cache/MetadataCache';
import { MetadataEntity } from '@main/metadata/models/MetadataEntity';
import { MetadataIdentity } from '@main/metadata/models/MetadataIdentity';
import { MetadataKinds } from '@main/metadata/models/MetadataKind';
import { MetadataValue } from '@main/metadata/models/MetadataValue';
import { describe, expect, it } from 'vitest';

describe('MetadataCache', () => {
  it('should store, retrieve, evict LRU, and invalidate by entity kind', () => {
    const cache = new MetadataCache({ maxEntries: 2 });
    const id1 = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 1 });
    const id2 = new MetadataIdentity({ entityKind: MetadataKinds.Song, entityId: 2 });
    const id3 = new MetadataIdentity({ entityKind: MetadataKinds.Artist, entityId: 3 });

    const entity1 = new MetadataEntity({
      identity: id1,
      fields: { title: new MetadataValue({ value: 'Song 1' }) }
    });
    const entity2 = new MetadataEntity({
      identity: id2,
      fields: { title: new MetadataValue({ value: 'Song 2' }) }
    });
    const entity3 = new MetadataEntity({
      identity: id3,
      fields: { artist: new MetadataValue({ value: 'Artist 3' }) }
    });

    cache.set(entity1);
    cache.set(entity2);
    expect(cache.size()).toBe(2);

    // Setting 3rd entry should evict oldest (entity1)
    cache.set(entity3);
    expect(cache.size()).toBe(2);
    expect(cache.get(id1)).toBeUndefined();
    expect(cache.get(id2)).toBe(entity2);
    expect(cache.get(id3)).toBe(entity3);

    // Invalidate by kind (Song) should remove entity2 but keep entity3
    cache.invalidateKind(MetadataKinds.Song);
    expect(cache.size()).toBe(1);
    expect(cache.get(id2)).toBeUndefined();
    expect(cache.get(id3)).toBe(entity3);
  });
});
