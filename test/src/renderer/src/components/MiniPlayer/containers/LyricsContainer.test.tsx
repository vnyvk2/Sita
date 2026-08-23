// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LyricsContainer from '@renderer/components/MiniPlayer/containers/LyricsContainer';
import { store } from '@renderer/store/store';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal: string) => defaultVal || key
    })
  };
});

describe('LyricsContainer Correctness & Race Protection', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 1,
        title: 'Song One',
        artists: [{ name: 'Artist One', artistId: '1' }],
        path: '/path/one.mp3',
        duration: 180,
        isKnownSource: true
      },
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          autoTranslateLyrics: false,
          autoConvertLyrics: false
        }
      }
    }));
  });

  afterEach(() => {
    cleanup();
  });

  const renderWithQuery = (ui: React.ReactNode) =>
    render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  it('renders unsynced plain-text lyrics when synced lyrics are unavailable', async () => {
    const mockLyrics: SongLyrics = {
      title: 'Song One',
      source: 'offline',
      lyrics: {
        isSynced: false,
        unparsedLyrics: 'Line 1\nLine 2',
        parsedLyrics: [
          { originalText: 'First plain lyric line' },
          { originalText: 'Second plain lyric line' }
        ],
        copyright: ''
      }
    };

    window.api = {
      ...window.api,
      lyrics: {
        getSongLyrics: vi.fn().mockResolvedValue(mockLyrics)
      }
    } as any;

    renderWithQuery(<LyricsContainer isLyricsVisible />);

    expect(await screen.findByText('First plain lyric line')).not.toBeNull();
    expect(await screen.findByText('Second plain lyric line')).not.toBeNull();
    expect(screen.queryByText('lyricsPage.noSyncedLyrics')).toBeNull();
  });

  it('protects against stale out-of-order async lyrics responses via TanStack Query key isolation', async () => {
    let resolveSongA: (lyrics: SongLyrics) => void;
    const songAPromise = new Promise<SongLyrics>((resolve) => {
      resolveSongA = resolve;
    });

    const songALyrics: SongLyrics = {
      title: 'Song One',
      source: 'offline',
      lyrics: {
        isSynced: false,
        unparsedLyrics: 'Song A Lyric',
        parsedLyrics: [{ originalText: 'Song A Lyric' }]
      }
    };

    const songBLyrics: SongLyrics = {
      title: 'Song Two',
      source: 'offline',
      lyrics: {
        isSynced: false,
        unparsedLyrics: 'Song B Lyric',
        parsedLyrics: [{ originalText: 'Song B Lyric' }]
      }
    };

    const getSongLyricsMock = vi.fn().mockImplementation(({ songTitle }) => {
      if (songTitle === 'Song One') return songAPromise;
      return Promise.resolve(songBLyrics);
    });

    window.api = {
      ...window.api,
      lyrics: {
        getSongLyrics: getSongLyricsMock
      }
    } as any;

    const { rerender } = renderWithQuery(<LyricsContainer isLyricsVisible />);

    // Fast skip to Song B while Song A is still pending
    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 2,
        title: 'Song Two',
        artists: [{ name: 'Artist Two', artistId: '2' }],
        path: '/path/two.mp3',
        duration: 200
      }
    }));

    rerender(
      <QueryClientProvider client={queryClient}>
        <LyricsContainer isLyricsVisible />
      </QueryClientProvider>
    );

    // Song B should resolve and render first
    expect(await screen.findByText('Song B Lyric')).not.toBeNull();
    expect(screen.queryByText('Song A Lyric')).toBeNull();

    // Now resolve Song A later
    resolveSongA!(songALyrics);
    await new Promise((r) => setTimeout(r, 50));

    // Stale Song A is isolated to Song A's query key; Song B lyrics must remain on screen
    expect(screen.getByText('Song B Lyric')).not.toBeNull();
    expect(screen.queryByText('Song A Lyric')).toBeNull();
  });
});
