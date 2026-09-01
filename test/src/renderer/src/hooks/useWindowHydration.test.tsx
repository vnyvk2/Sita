import { songClientCache, useWindowHydration } from '@renderer/hooks/useWindowHydration';
import { getSongListIdentity, songCacheKeys } from '@renderer/queries/songs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useWindowHydration - Query Identity & Cache Key Separation', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    songClientCache.clear();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    (window as any).api = {
      audioLibraryControls: {
        getSongInfo: vi.fn().mockImplementation(async (ids: number[]) => {
          return ids.map((id) => ({
            id,
            songId: id,
            title: `Song ${id}`,
            artists: ['Artist'],
            album: 'Album',
            duration: 200,
            songPath: `/music/${id}.mp3`
          }));
        })
      }
    };
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('guarantees two distinct queries with identical dataUpdatedAt timestamps have distinct cache keys', async () => {
    const timestamp = 1700000000000;
    const idsA = [1, 2, 3];
    const idsB = [4, 5, 6];

    const identityA = getSongListIdentity({ sortType: 'aToZ' } as any);
    const identityB = getSongListIdentity({ sortType: 'zToA' } as any);

    expect(identityA).not.toBe(identityB);

    const { result: resultA } = renderHook(
      () =>
        useWindowHydration(idsA, timestamp, {
          listIdentity: identityA,
          keyPrefix: 'songs'
        }),
      { wrapper }
    );

    const { result: resultB } = renderHook(
      () =>
        useWindowHydration(idsB, timestamp, {
          listIdentity: identityB,
          keyPrefix: 'songs'
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(resultA.current.getItem(0)).toBeDefined();
      expect(resultB.current.getItem(0)).toBeDefined();
    });

    // Verify item 0 from query A is song 1, and item 0 from query B is song 4
    expect(resultA.current.getItem(0)?.id).toBe(1);
    expect(resultB.current.getItem(0)?.id).toBe(4);

    // Verify cache keys exist under their respective unique query identities
    const queryCache = queryClient.getQueryCache().getAll();
    const queryKeys = queryCache.map((q) => q.queryKey);

    expect(queryKeys).toContainEqual(['songs', 'window', identityA, timestamp, 0]);
    expect(queryKeys).toContainEqual(['songs', 'window', identityB, timestamp, 0]);
  });

  it('produces identical cache keys for identical query params and timestamps', () => {
    const timestamp = 1700000000000;
    const identity1 = getSongListIdentity({ sortType: 'aToZ' } as any);
    const identity2 = getSongListIdentity({ sortType: 'aToZ' } as any);

    const key1 = songCacheKeys.window(identity1, timestamp, 0);
    const key2 = songCacheKeys.window(identity2, timestamp, 0);

    expect(key1).toEqual(key2);
  });

  it('produces distinct cache keys for same query params when version/timestamp changes', () => {
    const identity = getSongListIdentity({ sortType: 'aToZ' } as any);

    const key1 = songCacheKeys.window(identity, 1000, 0);
    const key2 = songCacheKeys.window(identity, 2000, 0);

    expect(key1).not.toEqual(key2);
  });

  it('invalidates ONLY the corresponding list window cache when an ID changes in one list', async () => {
    const { invalidateWindowsContainingIds } = await import('@renderer/hooks/useDataSync');
    const { songQuery } = await import('@renderer/queries/songs');

    const timestampA = 1700000000000;
    const timestampB = 1700000000000;
    const paramsA = { sortType: 'aToZ' as const };
    const paramsB = { sortType: 'zToA' as const };

    const identityA = getSongListIdentity(paramsA);
    const identityB = getSongListIdentity(paramsB);

    // Populate QueryCache with list queries
    queryClient.setQueryData(songQuery.ids(paramsA).queryKey, {
      ids: [101, 102],
      total: 2,
      blacklistedIds: []
    });
    const queryA = queryClient.getQueryCache().find({ queryKey: songQuery.ids(paramsA).queryKey });
    queryA?.setState({ dataUpdatedAt: timestampA });

    queryClient.setQueryData(songQuery.ids(paramsB).queryKey, {
      ids: [201, 202],
      total: 2,
      blacklistedIds: []
    });
    const queryB = queryClient.getQueryCache().find({ queryKey: songQuery.ids(paramsB).queryKey });
    queryB?.setState({ dataUpdatedAt: timestampB });

    // Seed window caches for both lists
    const windowKeyA = songCacheKeys.window(identityA, timestampA, 0);
    const windowKeyB = songCacheKeys.window(identityB, timestampB, 0);

    queryClient.setQueryData(windowKeyA, [
      { id: 101, title: 'Song 101' },
      { id: 102, title: 'Song 102' }
    ]);
    queryClient.setQueryData(windowKeyB, [
      { id: 201, title: 'Song 201' },
      { id: 202, title: 'Song 202' }
    ]);

    const getWindowA = () => queryClient.getQueryCache().find({ queryKey: windowKeyA });
    const getWindowB = () => queryClient.getQueryCache().find({ queryKey: windowKeyB });

    expect(getWindowA()?.state.isInvalidated).toBe(false);
    expect(getWindowB()?.state.isInvalidated).toBe(false);

    // Invalidate ID 101 (only in List A)
    invalidateWindowsContainingIds(queryClient, new Set([101]));

    expect(getWindowA()?.state.isInvalidated).toBe(true);
    expect(getWindowB()?.state.isInvalidated).toBe(false);

    // Reset and invalidate ID 201 (only in List B)
    getWindowA()?.setState({ isInvalidated: false });
    invalidateWindowsContainingIds(queryClient, new Set([201]));

    expect(getWindowA()?.state.isInvalidated).toBe(false);
    expect(getWindowB()?.state.isInvalidated).toBe(true);
  });

  it('maps by actual songId when API returns fewer rows than requested (e.g. concurrent deletion)', async () => {
    const timestamp = 1700000000000;
    const ids = [1, 2, 3, 4];

    // Mock API to simulate deletion of song 2 (returns 1, 3, 4)
    (window as any).api.audioLibraryControls.getSongInfo = vi.fn().mockResolvedValue([
      { id: 1, songId: 1, title: 'Song 1' },
      { id: 3, songId: 3, title: 'Song 3' },
      { id: 4, songId: 4, title: 'Song 4' }
    ]);

    const identity = getSongListIdentity({ sortType: 'aToZ' } as any);

    const { result } = renderHook(
      () =>
        useWindowHydration(ids, timestamp, {
          listIdentity: identity,
          keyPrefix: 'songs'
        }),
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.getItem(0)).toBeDefined();
    });

    // Verify slots match correct requested IDs
    expect(result.current.getItem(0)?.id).toBe(1); // Requested ID 1
    expect(result.current.getItem(1)).toBeUndefined(); // Requested ID 2 missing
    expect(result.current.getItem(2)?.id).toBe(3); // Requested ID 3
    expect(result.current.getItem(3)?.id).toBe(4); // Requested ID 4
  });

  it('bails out of state updates during intra-window scroll and preserves stable getItem reference', async () => {
    const timestamp = 1700000000000;
    // 500 ids -> spans 3 windows (0..199, 200..399, 400..499)
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);

    (window as any).api.audioLibraryControls.getSongInfo = vi.fn().mockImplementation((batchIds: number[]) => {
      return Promise.resolve(batchIds.map((id) => ({ id, songId: id, title: `Song ${id}` })));
    });

    let renderCount = 0;
    const { result } = renderHook(
      () => {
        renderCount++;
        return useWindowHydration(ids, timestamp, {
          listIdentity: 'default',
          keyPrefix: 'songs'
        });
      },
      { wrapper }
    );

    await waitFor(() => {
      expect(result.current.getItem(0)).toBeDefined();
    });

    // Sync initial range
    act(() => {
      result.current.onRangeChange({ startIndex: 0, endIndex: 15 });
    });

    const initialGetItem = result.current.getItem;
    const settledRenderCount = renderCount;

    // 1. Pure intra-window scrolling: 50 scroll ticks where visible range + buffer stays within window 0 (indices 1..30)
    act(() => {
      for (let i = 1; i <= 30; i++) {
        result.current.onRangeChange({ startIndex: i, endIndex: i + 15 });
      }
    });

    // ZERO additional hook re-renders during intra-window scrolling!
    expect(renderCount).toBe(settledRenderCount);
    expect(result.current.getItem).toBe(initialGetItem);

    // 2. Crossing prefetch boundary: scroll to index 50 (50 + 150 buffer = 200 -> prefetch window 1)
    act(() => {
      result.current.onRangeChange({ startIndex: 50, endIndex: 65 });
    });

    // Exactly 1 state update to prefetch the next 200-row window chunk
    expect(renderCount).toBe(settledRenderCount + 1);
    expect(result.current.getItem).toBe(initialGetItem);
  });
});
