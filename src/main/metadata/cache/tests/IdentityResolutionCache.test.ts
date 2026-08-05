import { describe, expect, it } from 'vitest';
import { IdentityResolutionCache } from '../IdentityResolutionCache';

describe('Metadata Cache — IdentityResolutionCache', () => {
  it('stores and retrieves provider entity identity resolutions', () => {
    const cache = new IdentityResolutionCache({ ttlMs: 5000 });

    cache.set('musicbrainz', 'song:123', 'mbid-uuid-123456');
    expect(cache.has('musicbrainz', 'song:123')).toBe(true);
    expect(cache.get<string>('musicbrainz', 'song:123')).toBe('mbid-uuid-123456');
  });

  it('evicts oldest entry when maxEntries is exceeded (LRU strategy)', () => {
    const cache = new IdentityResolutionCache({ maxEntries: 2, evictionStrategy: 'lru' });

    cache.set('musicbrainz', 'key1', 'val1');
    cache.set('musicbrainz', 'key2', 'val2');

    // Touch key1 so key2 becomes least recently used
    cache.get('musicbrainz', 'key1');

    cache.set('musicbrainz', 'key3', 'val3');

    expect(cache.has('musicbrainz', 'key1')).toBe(true);
    expect(cache.has('musicbrainz', 'key2')).toBe(false); // Evicted
    expect(cache.has('musicbrainz', 'key3')).toBe(true);
  });

  it('expires entries after TTL', async () => {
    const cache = new IdentityResolutionCache({ ttlMs: 50 }); // 50ms TTL

    cache.set('discogs', 'artist:456', { name: 'Daft Punk' });
    expect(cache.has('discogs', 'artist:456')).toBe(true);

    await new Promise((res) => setTimeout(res, 60));
    expect(cache.get('discogs', 'artist:456')).toBeUndefined();
    expect(cache.has('discogs', 'artist:456')).toBe(false);
  });
});
