import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { IdentityResolutionCache } from '../IdentityResolutionCache';

describe('Metadata Cache — IdentityResolutionCache', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('expires entries after TTL deterministically with fake timers', () => {
    const cache = new IdentityResolutionCache({ ttlMs: 1000 });

    cache.set('discogs', 'artist:456', { name: 'Daft Punk' });
    expect(cache.has('discogs', 'artist:456')).toBe(true);

    vi.advanceTimersByTime(1001);
    expect(cache.get('discogs', 'artist:456')).toBeUndefined();
    expect(cache.has('discogs', 'artist:456')).toBe(false);
  });

  it('prunes expired entries proactively on cache pressure without evicting active entries', () => {
    const cache = new IdentityResolutionCache({ maxEntries: 2, ttlMs: 1000 });

    cache.set('provider1', 'expiredKey', 'oldValue');
    vi.advanceTimersByTime(1001); // Let expiredKey expire

    cache.set('provider1', 'activeKey', 'activeValue');
    // Adding 3rd key triggers pruneExpired() before evictOne()
    cache.set('provider1', 'newKey', 'newValue');

    expect(cache.size()).toBe(2);
    expect(cache.has('provider1', 'expiredKey')).toBe(false);
    expect(cache.has('provider1', 'activeKey')).toBe(true);
    expect(cache.has('provider1', 'newKey')).toBe(true);
  });

  it('reclaims multiple expired entries under capacity pressure without evicting live entries', () => {
    const cache = new IdentityResolutionCache({ maxEntries: 4, ttlMs: 1000 });

    // Fill cache with 3 entries
    cache.set('provider1', 'exp1', 'val1');
    cache.set('provider1', 'exp2', 'val2');
    cache.set('provider1', 'exp3', 'val3');

    // Advance time so exp1, exp2, exp3 expire
    vi.advanceTimersByTime(1001);

    // Add 1 active entry
    cache.set('provider1', 'live1', 'activeVal1');
    expect(cache.size()).toBe(4); // Internal Map has 4 items (3 expired, 1 live)

    // Insert 5th entry, which exceeds maxEntries (4) -> triggers pruneExpired()
    cache.set('provider1', 'live2', 'activeVal2');

    // All 3 expired entries are pruned, live1 and live2 are preserved
    expect(cache.size()).toBe(2);
    expect(cache.has('provider1', 'exp1')).toBe(false);
    expect(cache.has('provider1', 'exp2')).toBe(false);
    expect(cache.has('provider1', 'exp3')).toBe(false);
    expect(cache.has('provider1', 'live1')).toBe(true);
    expect(cache.has('provider1', 'live2')).toBe(true);
  });
});
