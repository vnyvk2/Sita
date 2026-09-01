import { useLyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Lyrics TanStack Query Unification & Deduplication (Phase L2)', () => {
  let queryClient: QueryClient;
  let mockGetSongLyrics: any;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    mockGetSongLyrics = vi.fn().mockResolvedValue({
      isOfflineLyricsAvailable: false,
      lyrics: {
        copyright: 'Test Copyright',
        isSynced: true,
        offset: 0,
        parsedLyrics: [
          { start: 0, end: 5, originalText: 'Shared Lyric Line 1' },
          { start: 5, end: 10, originalText: 'Shared Lyric Line 2' }
        ]
      }
    });

    (window as any).api = {
      lyrics: {
        getSongLyrics: mockGetSongLyrics,
        getTranslatedLyrics: vi.fn(),
        convertLyricsToPinyin: vi.fn(),
        romanizeLyrics: vi.fn(),
        convertLyricsToRomaja: vi.fn()
      }
    };

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        songId: 101,
        title: 'Dedup Song',
        artists: [{ artistId: 1, name: 'Dedup Artist' }],
        album: { albumId: 1, name: 'Dedup Album' },
        path: '/path/to/dedup.mp3',
        duration: 240
      } as any,
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          lyricsAutomaticallySaveState: 'NONE',
          autoTranslateLyrics: false,
          autoConvertLyrics: false
        }
      } as any
    }));
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  it('deduplicates concurrent lyrics requests across multiple components', async () => {
    // Mount consumer 1 (e.g. FullScreenPlayer) and consumer 2 (e.g. MiniPlayer) concurrently
    const { result: consumer1 } = renderHook(() => useLyricsQuery({ enabled: true }), { wrapper });
    const { result: consumer2 } = renderHook(() => useLyricsQuery({ enabled: true }), { wrapper });

    await waitFor(() => expect(consumer1.current.isSuccess).toBe(true));
    await waitFor(() => expect(consumer2.current.isSuccess).toBe(true));

    // Both consumers must receive the identical parsed lyrics data
    expect(consumer1.current.data?.lyrics?.parsedLyrics?.[0]?.originalText).toBe(
      'Shared Lyric Line 1'
    );
    expect(consumer2.current.data?.lyrics?.parsedLyrics?.[0]?.originalText).toBe(
      'Shared Lyric Line 1'
    );

    // CRITICAL: getSongLyrics IPC must be called EXACTLY ONCE for both concurrent consumers
    expect(mockGetSongLyrics).toHaveBeenCalledTimes(1);
  });

  it('serves cached lyrics instantly when a new consumer mounts within staleTime', async () => {
    const { result: consumer1 } = renderHook(() => useLyricsQuery({ enabled: true }), { wrapper });
    await waitFor(() => expect(consumer1.current.isSuccess).toBe(true));
    expect(mockGetSongLyrics).toHaveBeenCalledTimes(1);

    // Mount consumer 3 later (e.g. user opens LyricsDrawer)
    const { result: consumer3 } = renderHook(() => useLyricsQuery({ enabled: true }), { wrapper });
    expect(consumer3.current.data?.lyrics?.parsedLyrics?.[0]?.originalText).toBe(
      'Shared Lyric Line 1'
    );

    // Still exactly 1 call (0 extra IPC roundtrips)
    expect(mockGetSongLyrics).toHaveBeenCalledTimes(1);
  });
});
