// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import FullScreenPlayer from '@renderer/components/FullScreenPlayer/FullScreenPlayer';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import PlayerQueue from '@renderer/other/playerQueue';
import { QueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: any) => (typeof defaultVal === 'string' ? defaultVal : key)
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useLocation: () => undefined
}));

vi.mock('@renderer/components/TitleBar/TitleBar', () => ({
  default: () => <div data-testid="mock-title-bar">TitleBar</div>
}));

vi.mock('@renderer/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    currentTime: 30,
    duration: 200,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  })
}));

vi.mock('@renderer/queries/lyrics', () => ({
  useLyricsQuery: () => ({
    data: null,
    isPending: false
  })
}));

const mockGetSongInfo = vi.fn();
const mockGetSongListeningData = vi.fn();
const mockGetArtistOnlineProfile = vi.fn();

(window as any).api = {
  appControls: {
    stopScreenSleeping: vi.fn(),
    allowScreenSleeping: vi.fn()
  },
  audioLibraryControls: {
    getSongInfo: mockGetSongInfo,
    getSongListeningData: mockGetSongListeningData
  },
  artistsData: {
    getArtistOnlineProfile: mockGetArtistOnlineProfile
  },
  properties: {
    isInDevelopment: false,
    platform: 'win32'
  }
};

describe('FullScreenPlayer Stages, Shortcuts, Sing Mode & Queue Drawer', () => {
  let queryClient: QueryClient;
  let mockToggleSongPlayback: ReturnType<typeof vi.fn>;
  let mockUpdatePlayerType: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    mockToggleSongPlayback = vi.fn();
    mockUpdatePlayerType = vi.fn();

    mockGetSongInfo.mockResolvedValue([
      {
        songId: 42,
        title: 'Starlight',
        year: 2006,
        trackNo: 2,
        genres: [{ genreId: 1, name: 'Alternative Rock' }],
        duration: 240,
        artists: [{ name: 'Muse', artistId: 1 }],
        album: { name: 'Black Holes and Revelations', albumId: 1 }
      }
    ]);

    mockGetSongListeningData.mockResolvedValue([
      {
        songId: 42,
        playEvents: [
          { createdAt: new Date().toISOString(), playbackPercentage: '1.0' },
          { createdAt: new Date().toISOString(), playbackPercentage: '0.5' }
        ],
        skipEvents: [{ createdAt: new Date().toISOString() }],
        seekEvents: []
      }
    ]);

    mockGetArtistOnlineProfile.mockResolvedValue({
      bioSource: 'Wikipedia',
      bioSummary: 'Muse are an English rock band from Teignmouth, Devon, formed in 1994.',
      bioParagraphs: ['Muse are an English rock band from Teignmouth, Devon, formed in 1994.'],
      tags: [{ name: 'Progressive Rock', url: '' }],
      availableBiographies: [
        {
          source: 'Wikipedia',
          summary: 'Muse are an English rock band from Teignmouth, Devon, formed in 1994.',
          paragraphs: ['Muse are an English rock band from Teignmouth, Devon, formed in 1994.']
        }
      ]
    });

    const queue = new PlayerQueue([42], 0, undefined, undefined, 'fs-main-queue');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).__NORA_QUEUES_MANAGER__ = manager;

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 42,
        title: 'Starlight',
        artists: [{ artistId: 1, name: 'Muse' }],
        album: { albumId: 1, name: 'Black Holes and Revelations' },
        duration: 240,
        path: '/music/Muse - Starlight.flac',
        sampleRate: 96000,
        bitrate: 3072000,
        isKnownSource: true,
        isAFavorite: false
      },
      player: {
        ...prev.player,
        isCurrentSongPlaying: true
      },
      localStorage: {
        ...prev.localStorage,
        playback: {
          ...prev.localStorage?.playback,
          isKaraoke: false,
          karaokeLevel: 85
        },
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  const renderFullScreen = () =>
    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider
          value={
            {
              updatePlayerType: mockUpdatePlayerType,
              toggleSongPlayback: mockToggleSongPlayback,
              updateVolume: vi.fn(),
              toggleIsFavorite: vi.fn(),
              toggleQueueShuffle: vi.fn(),
              toggleRepeat: vi.fn(),
              handleSkipBackwardClick: vi.fn(),
              handleSkipForwardClick: vi.fn(),
              toggleMutedState: vi.fn(),
              changeQueueCurrentSongIndex: vi.fn()
            } as any
          }
        >
          <FullScreenPlayer />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

  it('renders Multi-Layer Liquid Backdrop, Zen Clock, and Stage Switcher by default', () => {
    renderFullScreen();

    expect(screen.getByTestId('fullscreen-liquid-backdrop')).toBeDefined();
    expect(screen.getByTestId('liquid-mesh-lobe-primary')).toBeDefined();
    expect(screen.getByTestId('liquid-mesh-lobe-secondary')).toBeDefined();
    expect(screen.getByTestId('fullscreen-zen-clock')).toBeDefined();
    expect(screen.getByTestId('fullscreen-stage-switcher')).toBeDefined();
    expect(screen.getByTestId('fullscreen-showcase-layout')).toBeDefined();
  });

  it('switches to Vinyl Turntable Stage on V key and allows tonearm click to toggle playback', () => {
    renderFullScreen();

    fireEvent.keyDown(window, { key: 'v' });
    expect(screen.getByTestId('fullscreen-vinyl-stage')).toBeDefined();
    expect(screen.getByTestId('vinyl-spinning-disc').getAttribute('data-spinning')).toBe('true');

    const tonearmBtn = screen.getByTestId('vinyl-tonearm-btn');
    fireEvent.click(tonearmBtn);
    expect(mockToggleSongPlayback).toHaveBeenCalledTimes(1);

    // Pressing V again returns to Showcase
    fireEvent.keyDown(window, { key: 'v' });
    expect(screen.queryByTestId('fullscreen-vinyl-stage')).toBeNull();
  });

  it('switches to Roon-Style Liner Notes Carousel on I key and cycles through Artist Bio, Signal Path, and Stats slides', async () => {
    renderFullScreen();

    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByTestId('fullscreen-split-layout')).toBeDefined();
    expect(screen.getByTestId('fullscreen-liner-notes-stage')).toBeDefined();
    expect(screen.getByTestId('liner-notes-artist-bio')).toBeDefined();
    expect(screen.getByTestId('liner-notes-signal-path')).toBeDefined();
    expect(screen.getByTestId('liner-notes-telemetry')).toBeDefined();
    expect(screen.getByTestId('liner-notes-release')).toBeDefined();

    // Slide 1 (default): Artist Bio
    expect(screen.getByTestId('liner-notes-carousel-track').getAttribute('data-active-slide')).toBe(
      'bio'
    );
    await screen.findByText(/Muse are an English rock band/i);

    // Click Next Slide -> Slide 2: Signal Path
    fireEvent.click(screen.getByTestId('liner-notes-next-btn'));
    expect(screen.getByTestId('liner-notes-carousel-track').getAttribute('data-active-slide')).toBe(
      'signal'
    );

    // Click Next Slide -> Slide 3: Play History & Credits
    fireEvent.click(screen.getByTestId('liner-notes-next-btn'));
    expect(screen.getByTestId('liner-notes-carousel-track').getAttribute('data-active-slide')).toBe(
      'stats'
    );
    await screen.findByText('Alternative Rock');
    expect(screen.getByText('2006')).toBeDefined();
  });

  it('toggles Zen Clock on C key or toolbar button click', () => {
    renderFullScreen();
    expect(screen.queryByTestId('fullscreen-zen-clock')).not.toBeNull();

    fireEvent.keyDown(window, { key: 'c' });
    expect(screen.queryByTestId('fullscreen-zen-clock')).toBeNull();

    fireEvent.click(screen.getByTestId('fullscreen-zen-clock-toggle-btn'));
    expect(screen.queryByTestId('fullscreen-zen-clock')).not.toBeNull();
  });

  it('toggles Sing Mode (Karaoke Vocal Reducer) on K key or mic button click', () => {
    renderFullScreen();
    expect(store.state.localStorage.playback.isKaraoke).toBe(false);

    fireEvent.keyDown(window, { key: 'k' });
    expect(store.state.localStorage.playback.isKaraoke).toBe(true);

    fireEvent.click(screen.getByTestId('fullscreen-karaoke-toggle-btn'));
    expect(store.state.localStorage.playback.isKaraoke).toBe(false);
  });

  it('opens Queue Drawer on Q key, closes Queue Drawer on first Escape, and exits Fullscreen on second Escape', () => {
    renderFullScreen();

    fireEvent.keyDown(window, { key: 'q' });
    expect(screen.getByTestId('fullscreen-queue-drawer').className).toContain('translate-x-0');
    expect(screen.queryByTestId('queue-container')).not.toBeNull();

    // First Escape closes queue drawer without exiting fullscreen
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('fullscreen-queue-drawer').className).toContain('translate-x-full');
    expect(mockUpdatePlayerType).not.toHaveBeenCalled();

    // Second Escape exits fullscreen
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockUpdatePlayerType).toHaveBeenCalledWith('normal');
  });
});
