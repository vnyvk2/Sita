// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import React, { type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DYNAMIC_ICON_DEBOUNCE_MS,
  dynamicIconStore,
  useDynamicAppIcon
} from '../../../../../src/renderer/src/hooks/useDynamicAppIcon';
import { store } from '../../../../../src/renderer/src/store/store';

let mockDynamicEnabled = true;

vi.mock('../../../../../src/renderer/src/hooks/useVisualSlot', () => ({
  useVisualAssetsState: () => ({
    data: {
      config: {
        dynamicNowPlayingIcon: mockDynamicEnabled,
        slots: {},
        customAssets: []
      },
      customAssetsProtocolBaseUrl: 'nora://localfiles/'
    }
  })
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useDynamicAppIcon hook', () => {
  let mockSetDynamicIcon: ReturnType<typeof vi.fn>;

  const createMockSong = (id: number, hasGenuineArtwork = true) => ({
    songId: id,
    title: `Track ${id}`,
    duration: 180,
    artists: [{ name: 'Artist' }],
    path: `/music/track${id}.mp3`,
    artworkPaths: {
      isDefaultArtwork: !hasGenuineArtwork,
      artworkPath: hasGenuineArtwork ? `/artworks/track_${id}.webp` : '/assets/default.webp',
      optimizedArtworkPath: hasGenuineArtwork
        ? `/artworks/track_${id}-optimized.webp`
        : '/assets/default.webp'
    }
  });

  beforeEach(() => {
    vi.useFakeTimers();
    mockDynamicEnabled = true;
    mockSetDynamicIcon = vi.fn().mockResolvedValue({ applied: true });

    (window as any).api = {
      ...((window as any).api || {}),
      visualAssets: {
        setDynamicNowPlayingIcon: mockSetDynamicIcon
      }
    };

    dynamicIconStore.setState(() => ({ activeDynamicArtworkUrl: null }));
    store.setState((prev) => ({
      ...prev,
      currentSongData: createMockSong(101, true) as any
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('applies genuine artwork immediately for the initial loaded track without waiting 3.5s', () => {
    const { result } = renderHook(() => useDynamicAppIcon(), { wrapper: createWrapper() });

    // Must be applied immediately (0ms delay) on initial sync
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);
    expect(mockSetDynamicIcon).toHaveBeenCalledWith('/artworks/track_101-optimized.webp');
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/track_101-optimized.webp');
  });

  it('debounces subsequent track transitions for 3.5s and keeps previous artwork during delay', () => {
    const { result, rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });

    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/track_101-optimized.webp');

    // Switch to track 102
    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: createMockSong(102, true) as any
      }));
    });
    rerender();

    // Immediately after track change: must NOT have called IPC yet, icon stays on track 101
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/track_101-optimized.webp');

    // Advance 2 seconds (less than 3.5s): still unchanged
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);

    // Advance past 3.5s: updates to track 102
    act(() => {
      vi.advanceTimersByTime(DYNAMIC_ICON_DEBOUNCE_MS - 2000);
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(2);
    expect(mockSetDynamicIcon).toHaveBeenLastCalledWith('/artworks/track_102-optimized.webp');
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/track_102-optimized.webp');
  });

  it('restarts the 3.5s timer during rapid skipping and only applies the final settled track', () => {
    const { rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);

    // Rapid skip: 101 -> 102 -> 103 within 1 second each
    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: createMockSong(102, true) as any
      }));
    });
    rerender();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: createMockSong(103, true) as any
      }));
    });
    rerender();
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Still no second IPC call made
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);

    // Now settle on track 103 for the full 3.5s
    act(() => {
      vi.advanceTimersByTime(DYNAMIC_ICON_DEBOUNCE_MS);
    });

    // Must have applied track 103 only, completely skipping 102!
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(2);
    expect(mockSetDynamicIcon).toHaveBeenLastCalledWith('/artworks/track_103-optimized.webp');
  });

  it('restores static icon (null) after 3.5s if the newly settled track has no genuine artwork', () => {
    const { result, rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledWith('/artworks/track_101-optimized.webp');

    // Switch to track 104 with default placeholder artwork (isDefaultArtwork: true)
    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: createMockSong(104, false) as any
      }));
    });
    rerender();

    // Advance 3.5s
    act(() => {
      vi.advanceTimersByTime(DYNAMIC_ICON_DEBOUNCE_MS);
    });

    // Restores static icon via null
    expect(mockSetDynamicIcon).toHaveBeenLastCalledWith(null);
    expect(result.current.activeDynamicArtworkUrl).toBeNull();
  });

  it('preserves the current artwork across pause and resume without resetting', () => {
    const { result, rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);

    // Simulate pause (player state changes, songId stays 101)
    act(() => {
      store.setState((prev) => ({
        ...prev,
        player: { ...prev.player, isCurrentSongPlaying: false }
      }));
    });
    rerender();

    // Advance time
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Still on track 101 artwork without any reset
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(1);
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/track_101-optimized.webp');
  });

  it('immediately restores static icon and cancels timer when queue is cleared', () => {
    const { result, rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });

    // Switch to track 102 (debounce timer starts)
    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: createMockSong(102, true) as any
      }));
    });
    rerender();

    // Clear queue before timer fires
    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: { ...prev.currentSongData, songId: undefined as any }
      }));
    });
    rerender();

    // Must immediately revert to static icon
    expect(mockSetDynamicIcon).toHaveBeenLastCalledWith(null);
    expect(result.current.activeDynamicArtworkUrl).toBeNull();

    // Advancing timers should not trigger anything stale
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledTimes(2); // initial (101) + clear (null)
  });

  it('immediately restores static icon when dynamic mode is disabled', () => {
    const { result, rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });
    expect(mockSetDynamicIcon).toHaveBeenCalledWith('/artworks/track_101-optimized.webp');

    // Disable feature
    mockDynamicEnabled = false;
    rerender();

    expect(mockSetDynamicIcon).toHaveBeenLastCalledWith(null);
    expect(result.current.activeDynamicArtworkUrl).toBeNull();
  });

  it('supports songs that provide flat artworkPath without nested artworkPaths', () => {
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 202,
        title: 'Flat Track',
        duration: 120,
        artworkPath: '/artworks/flat_cover.webp'
      } as any
    }));

    const { result } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });

    expect(mockSetDynamicIcon).toHaveBeenCalledWith('/artworks/flat_cover.webp');
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/flat_cover.webp');
  });

  it('hydrates artwork for the same track when artwork becomes available after initial load without dropped update', () => {
    // 1. Initial load has song metadata but artwork is pending/null
    store.setState((prev) => ({
      ...prev,
      currentSongData: createMockSong(301, false) as any
    }));

    const { result, rerender } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });

    expect(mockSetDynamicIcon).toHaveBeenCalledWith(null);
    expect(result.current.activeDynamicArtworkUrl).toBeNull();

    // 2. Artwork resolves asynchronously for the same song (songId 301)
    act(() => {
      store.setState((prev) => ({
        ...prev,
        currentSongData: createMockSong(301, true) as any
      }));
    });
    rerender();

    // Must immediately hydrate to genuine artwork without dropping the update
    expect(mockSetDynamicIcon).toHaveBeenLastCalledWith('/artworks/track_301-optimized.webp');
    expect(result.current.activeDynamicArtworkUrl).toBe('/artworks/track_301-optimized.webp');
  });

  it('rolls back store state when main process rejects artwork', async () => {
    mockSetDynamicIcon.mockResolvedValueOnce({ applied: false, reason: 'decode_failed' });

    store.setState((prev) => ({
      ...prev,
      currentSongData: createMockSong(401, true) as any
    }));

    const { result } = renderHook(() => useDynamicAppIcon(), {
      wrapper: createWrapper()
    });

    // Let the IPC promise resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Optimistic state must be rolled back to null
    expect(result.current.activeDynamicArtworkUrl).toBeNull();
  });
});
