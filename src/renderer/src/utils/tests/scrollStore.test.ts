import { describe, it, expect, beforeEach } from 'vitest';

import { ScrollRegistry } from '../scrollStore';

describe('ScrollRegistry', () => {
  let registry: ScrollRegistry;

  beforeEach(() => {
    registry = new ScrollRegistry(3); // Capacity of 3 for deterministic LRU testing
  });

  it('should store and retrieve scroll position with index and offset', () => {
    registry.set('songs-all', { index: 42, offset: 15.5 });

    expect(registry.get('songs-all')).toEqual({ index: 42, offset: 15.5 });
    expect(registry.getIndex('songs-all')).toBe(42);
  });

  it('should return undefined for non-existent keys', () => {
    expect(registry.get('non-existent')).toBeUndefined();
    expect(registry.getIndex('non-existent')).toBeUndefined();
  });

  it('should maintain independent scroll positions per dataset identity', () => {
    registry.set('songs-rock', { index: 100, offset: 0 });
    registry.set('songs-pop', { index: 200, offset: 10 });

    expect(registry.getIndex('songs-rock')).toBe(100);
    expect(registry.getIndex('songs-pop')).toBe(200);

    registry.clear('songs-rock');
    expect(registry.get('songs-rock')).toBeUndefined();
    expect(registry.getIndex('songs-pop')).toBe(200);
  });

  it('should evict the Least Recently Used (LRU) entry when capacity is exceeded', () => {
    registry.set('key1', { index: 1 });
    registry.set('key2', { index: 2 });
    registry.set('key3', { index: 3 });

    expect(registry.size).toBe(3);

    // Insert 4th entry; key1 should be evicted as the oldest
    registry.set('key4', { index: 4 });

    expect(registry.size).toBe(3);
    expect(registry.get('key1')).toBeUndefined();
    expect(registry.get('key2')).toEqual({ index: 2 });
    expect(registry.get('key3')).toEqual({ index: 3 });
    expect(registry.get('key4')).toEqual({ index: 4 });
  });

  it('should promote an entry to MRU on get(), protecting it from eviction', () => {
    registry.set('keyA', { index: 10 });
    registry.set('keyB', { index: 20 });
    registry.set('keyC', { index: 30 });

    // Access keyA -> promotes keyA to MRU; keyB is now the oldest/LRU
    expect(registry.get('keyA')).toEqual({ index: 10 });

    // Insert keyD -> should evict keyB (the oldest), NOT keyA
    registry.set('keyD', { index: 40 });

    expect(registry.get('keyB')).toBeUndefined(); // keyB evicted
    expect(registry.get('keyA')).toEqual({ index: 10 }); // keyA preserved!
    expect(registry.get('keyC')).toEqual({ index: 30 });
    expect(registry.get('keyD')).toEqual({ index: 40 });
  });

  it('should clear all entries on clearAll()', () => {
    registry.set('k1', { index: 1 });
    registry.set('k2', { index: 2 });
    expect(registry.size).toBe(2);

    registry.clearAll();
    expect(registry.size).toBe(0);
    expect(registry.get('k1')).toBeUndefined();
  });
});
