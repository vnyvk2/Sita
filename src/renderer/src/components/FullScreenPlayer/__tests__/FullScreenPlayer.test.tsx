import { AppUpdateContext, type AppUpdateContextType } from '@renderer/contexts/AppUpdateContext';
import { store } from '@renderer/store/store';
// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import FullScreenPlayer from '../FullScreenPlayer';

// Mock Aurora and Particles to keep jsdom lightweight
vi.mock('../../fx/AuroraBackground', () => ({
  default: () => <div data-testid="aurora-background" />
}));
vi.mock('../../fx/ParticlesLayer', () => ({
  default: () => <div data-testid="particles-layer" />
}));
vi.mock('../../TitleBar/TitleBar', () => ({
  default: () => <div data-testid="title-bar" />
}));
vi.mock('../../MiniPlayer/containers/QueueContainer', () => ({
  default: ({ isQueueVisible }: { isQueueVisible: boolean }) => (
    <div data-testid="mock-queue-container" data-visible={isQueueVisible} />
  )
}));

const mockUseLyricsQuery = vi.fn();
vi.mock('../../../queries/lyrics', () => ({
  useLyricsQuery: (args: unknown) => mockUseLyricsQuery(args)
}));

const mockAudioPlayer = {
  currentTime: 45,
  duration: 180,
  volume: 0.8
};
vi.mock('../../../hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => mockAudioPlayer
}));

describe('FullScreenPlayer', () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false }
    }
  });

  const mockUpdatePlayerType = vi.fn();
  const mockToggleSongPlayback = vi.fn();
  const mockUpdateVolume = vi.fn();
  const mockToggleQueueShuffle = vi.fn();
  const mockToggleRepeat = vi.fn();
  const mockToggleIsFavorite = vi.fn();
  const mockHandleSkipForwardClick = vi.fn();
  const mockHandleSkipBackwardClick = vi.fn();
  const mockToggleMutedState = vi.fn();

  const mockContext: Partial<AppUpdateContextType> = {
    updatePlayerType: mockUpdatePlayerType,
    toggleSongPlayback: mockToggleSongPlayback,
    updateVolume: mockUpdateVolume,
    toggleQueueShuffle: mockToggleQueueShuffle,
    toggleRepeat: mockToggleRepeat,
    toggleIsFavorite: mockToggleIsFavorite,
    handleSkipForwardClick: mockHandleSkipForwardClick,
    handleSkipBackwardClick: mockHandleSkipBackwardClick,
    toggleMutedState: mockToggleMutedState
  };

  const renderPlayer = (ui: ReactNode = <FullScreenPlayer />) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider value={mockContext as AppUpdateContextType}>
          {ui}
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );
  };

  const initialStore = { ...store.state };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseLyricsQuery.mockReturnValue({ data: undefined, isPending: false });
    mockAudioPlayer.currentTime = 45;
    mockAudioPlayer.duration = 180;

    // Mock window.api appControls
    window.api = {
      ...(window.api || {}),
      appControls: {
        stopScreenSleeping: vi.fn(),
        allowScreenSleeping: vi.fn()
      }
    } as unknown as typeof window.api;

    store.setState((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        isCurrentSongPlaying: true,
        volume: { value: 75, isMuted: false }
      },
      currentSongData: {
        songId: 1,
        title: 'Starboy',
        duration: 230,
        isAFavorite: true,
        isKnownSource: true,
        isArtworkAvailable: true,
        path: '/music/starboy.flac',
        sampleRate: 44100,
        bitrate: 1411200,
        addedDate: 0,
        isBlacklisted: false,
        artists: [{ artistId: 10, name: 'The Weeknd' }],
        album: { albumId: 20, name: 'Starboy' },
        artworkPaths: {
          artworkPath: '/starboy.jpg',
          optimizedArtworkPath: '/starboy.jpg',
          isDefaultArtwork: false
        }
      }
    }));
  });

  afterEach(() => {
    store.setState(() => ({ ...initialStore }));
  });

  it('renders FullScreenPlayer in Centered Showcase layout when lyrics are inactive', () => {
    renderPlayer();

    expect(screen.getByTestId('fullscreen-player')).toBeDefined();
    expect(screen.getByTestId('fullscreen-showcase-layout')).toBeDefined();
    expect(screen.getAllByText('Starboy')[0]).toBeDefined();
    expect(screen.getAllByText('The Weeknd')[0]).toBeDefined();

    // Transport buttons exist
    expect(screen.getByTestId('fullscreen-play-pause-btn')).toBeDefined();
    expect(screen.getByTestId('fullscreen-lyrics-toggle-btn')).toBeDefined();
    expect(screen.getByTestId('fullscreen-queue-toggle-btn')).toBeDefined();
  });

  it('switches to Split layout when lyrics are toggled on and available', async () => {
    mockUseLyricsQuery.mockReturnValue({
      data: {
        lyrics: {
          isSynced: true,
          parsedLyrics: [
            {
              originalText: "I'm tryna put you in the worst mood",
              text: "I'm tryna put you in the worst mood",
              start: 10,
              end: 15
            }
          ]
        }
      },
      isPending: false
    });

    renderPlayer();

    // Click lyrics toggle button
    const lyricsBtn = screen.getByTestId('fullscreen-lyrics-toggle-btn');
    fireEvent.click(lyricsBtn);

    // Should now transition to Split View
    expect(screen.getByTestId('fullscreen-split-layout')).toBeDefined();
  });

  it('handles keyboard shortcuts: Space for play/pause and Escape to exit fullscreen', () => {
    renderPlayer();

    // Press Space
    fireEvent.keyDown(window, { key: ' ' });
    expect(mockToggleSongPlayback).toHaveBeenCalledTimes(1);

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(mockUpdatePlayerType).toHaveBeenCalledWith('normal');
  });

  it('handles arrow key shortcuts for seek and volume', () => {
    renderPlayer();

    // Left arrow seeks -5s
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(mockAudioPlayer.currentTime).toBe(40);

    // Right arrow seeks +5s
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(mockAudioPlayer.currentTime).toBe(45);

    // Up arrow increases volume (+5 from store 75)
    fireEvent.keyDown(window, { key: 'ArrowUp' });
    expect(mockUpdateVolume).toHaveBeenCalledWith(80);

    // Down arrow decreases volume (-5 from store 75)
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    expect(mockUpdateVolume).toHaveBeenCalledWith(70);
  });

  it('toggles Queue Drawer on Q key or button click, and closes on Escape', () => {
    renderPlayer();

    const queueBtn = screen.getByTestId('fullscreen-queue-toggle-btn');
    fireEvent.click(queueBtn);

    // Drawer is now open
    const drawer = screen.getByTestId('fullscreen-queue-drawer');
    expect(drawer.className).toContain('translate-x-0');

    // Pressing Escape while drawer is open closes drawer instead of exiting fullscreen
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(drawer.className).toContain('translate-x-full');
    expect(mockUpdatePlayerType).not.toHaveBeenCalled();
  });

  it('remains in Showcase layout without thrashing when lyrics are enabled but unavailable', () => {
    mockUseLyricsQuery.mockReturnValue({
      data: { lyrics: null },
      isPending: false
    });

    renderPlayer();

    // Lyrics toggle button clicked
    const lyricsBtn = screen.getByTestId('fullscreen-lyrics-toggle-btn');
    fireEvent.click(lyricsBtn);

    // Remains in Showcase mode because lyrics are not available
    expect(screen.getByTestId('fullscreen-showcase-layout')).toBeDefined();
    expect(screen.queryByTestId('fullscreen-split-layout')).toBeNull();
  });
});
