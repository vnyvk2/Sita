// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import MiniPlayer from '../../../../../../src/renderer/src/components/MiniPlayer/MiniPlayer';
import { store } from '../../../../../../src/renderer/src/store/store';

// Mock ResizeObserver constructor class
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

// Mock dependencies
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal: string) => defaultVal || key
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useRouter: () => ({
    navigate: vi.fn()
  }),
  useNavigate: () => vi.fn()
}));

vi.mock(
  '../../../../../../src/renderer/src/queries/settings',
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import('../../../../../../src/renderer/src/queries/settings')
      >();
    return {
      ...actual,
      settingsQuery: {
        all: {
          queryKey: ['settings'],
          queryFn: () => ({
            isMiniPlayerAlwaysOnTop: false
          })
        }
      },
      settingsMutation: {
        toggleMiniPlayerAlwaysOnTop: {
          mutationKey: ['toggleMiniPlayerAlwaysOnTop']
        }
      }
    };
  }
);

vi.mock('../../../../../../src/renderer/src/components/Img', () => ({
  default: ({ fallbackSrc, ...props }: any) => <img {...props} alt="Song Cover" />
}));

vi.mock(
  '../../../../../../src/renderer/src/components/MiniPlayer/containers/TitleBarContainer',
  () => ({
    default: () => <div data-testid="titlebar-container">TitleBar</div>
  })
);

vi.mock(
  '../../../../../../src/renderer/src/components/MiniPlayer/containers/QueueContainer',
  () => ({
    default: ({ isQueueVisible }: { isQueueVisible: boolean }) => (
      <div data-testid="queue-container">Queue (Visible: {String(isQueueVisible)})</div>
    )
  })
);

vi.mock(
  '../../../../../../src/renderer/src/components/MiniPlayer/containers/LyricsContainer',
  () => ({
    default: () => <div data-testid="lyrics-container">Lyrics</div>
  })
);

vi.mock('../../../../../../src/renderer/src/components/SeekBarSlider', () => ({
  default: () => <div data-testid="seek-bar-slider">SeekBar</div>
}));

vi.mock('../../../../../../src/renderer/src/components/MiniPlayer/UpNextSongPopup', () => ({
  default: () => null
}));

describe('MiniPlayer Spatial Layout & Hierarchy', () => {
  let queryClient: QueryClient;
  let showContextMenuMock: ReturnType<typeof vi.fn>;
  let resetToDefaultPositionMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    queryClient.setQueryData(['settings'], {
      isMiniPlayerAlwaysOnTop: false
    });

    showContextMenuMock = vi.fn();
    resetToDefaultPositionMock = vi.fn();

    window.api = {
      ...window.api,
      miniPlayer: {
        setMinimumBounds: vi.fn(),
        setDynamicMinimumBounds: vi.fn(),
        resetToDefaultPosition: resetToDefaultPositionMock,
        toggleMiniPlayerQueue: vi.fn().mockResolvedValue({ isExpanded: true, direction: 'down' }),
        toggleMiniPlayerAlwaysOnTop: vi.fn(),
        showContextMenu: showContextMenuMock
      }
    } as any;

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 1,
        title: 'Test Track',
        artists: [{ name: 'Test Artist', artistId: '1' }],
        artworkPath: 'path/to/artwork.jpg',
        isKnownSource: true
      },
      player: {
        ...prev.player,
        isCurrentSongPlaying: true
      },
      localStorage: {
        ...prev.localStorage,
        preferences: {
          ...prev.localStorage.preferences,
          miniPlayerPinnedControls: ['play', 'artwork', 'title']
        }
      }
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the stable 3-tier deck with TitleBar, Song Info, and Controls', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <MiniPlayer />
        </Suspense>
      </QueryClientProvider>
    );

    const deck = container.querySelector('.mini-player-deck');
    expect(deck).not.toBeNull();

    // Check that TitleBar is inside the deck
    const titleBar = screen.getByTestId('titlebar-container');
    expect(deck?.contains(titleBar)).toBe(true);

    // Check that SeekBar is inside the deck
    const seekBar = screen.getByTestId('seek-bar-slider');
    expect(deck?.contains(seekBar)).toBe(true);

    // Check that song title is inside the deck
    expect(screen.getByText('Test Track')).toBeDefined();
  });

  it('does not use flex-col-reverse on the root container', () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <MiniPlayer />
        </Suspense>
      </QueryClientProvider>
    );
    const root = container.querySelector('.mini-player');
    expect(root?.classList.contains('flex-col-reverse')).toBe(false);
    expect(root?.classList.contains('flex-col')).toBe(true);
  });

  it('includes reset to default position in context menu template', async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <MiniPlayer />
        </Suspense>
      </QueryClientProvider>
    );

    const root = container.querySelector('.mini-player')!;
    fireEvent.contextMenu(root);

    expect(showContextMenuMock).toHaveBeenCalledTimes(1);
    const template = showContextMenuMock.mock.calls[0][0];

    const resetItem = template.find((item: any) => item.id === 'resetMiniPlayer');
    expect(resetItem).toBeDefined();
    expect(resetItem.label).toBe('Reset to Default Position');
  });

  it('does not render queue until toggleMiniPlayerQueue resolves with direction, then renders ABOVE deck for up', async () => {
    let resolveToggle!: (value: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveToggle = resolve;
    });

    (window.api.miniPlayer.toggleMiniPlayerQueue as any).mockImplementationOnce(() => pendingPromise);

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <MiniPlayer />
        </Suspense>
      </QueryClientProvider>
    );

    const root = container.querySelector('.mini-player')!;
    showContextMenuMock.mockResolvedValueOnce('toggleQueue');
    fireEvent.contextMenu(root);

    // Allow context menu handler to trigger toggleMiniPlayerQueue
    await Promise.resolve();

    // Verify queue is NOT rendered in the DOM before IPC resolution (prevents direction flash)
    expect(screen.queryByTestId('queue-container')).toBeNull();

    // Resolve toggle with direction 'up'
    resolveToggle({
      isExpanded: true,
      direction: 'up'
    });

    const queue = await screen.findByTestId('queue-container');
    const deck = screen.getByTestId('mini-player-deck');

    expect(queue).toBeDefined();
    expect(deck).toBeDefined();
    // In DOM order: queue is rendered before deck (deck follows queue)
    const position = queue.compareDocumentPosition(deck);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders queue BELOW deck when toggleMiniPlayerQueue returns down direction', async () => {
    (window.api.miniPlayer.toggleMiniPlayerQueue as any).mockResolvedValueOnce({
      isExpanded: true,
      direction: 'down'
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <MiniPlayer />
        </Suspense>
      </QueryClientProvider>
    );

    const root = container.querySelector('.mini-player')!;
    showContextMenuMock.mockResolvedValueOnce('toggleQueue');
    fireEvent.contextMenu(root);

    const queue = await screen.findByTestId('queue-container');
    const deck = screen.getByTestId('mini-player-deck');

    expect(queue).toBeDefined();
    expect(deck).toBeDefined();
    // In DOM order: deck is rendered before queue (queue follows deck)
    const position = deck.compareDocumentPosition(queue);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('guards against rapid queue toggle calls while transition is in flight', async () => {
    let resolveFirstToggle: (val: any) => void;
    const pendingPromise = new Promise((resolve) => {
      resolveFirstToggle = resolve;
    });

    (window.api.miniPlayer.toggleMiniPlayerQueue as any).mockImplementationOnce(() => pendingPromise);

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <MiniPlayer />
        </Suspense>
      </QueryClientProvider>
    );

    const root = container.querySelector('.mini-player')!;

    // Trigger first toggle
    showContextMenuMock.mockResolvedValueOnce('toggleQueue');
    fireEvent.contextMenu(root);

    // Allow showContextMenu promise to resolve and start toggleMiniPlayerQueue
    await Promise.resolve();
    expect(window.api.miniPlayer.toggleMiniPlayerQueue).toHaveBeenCalledTimes(1);

    // Trigger second toggle while first toggleMiniPlayerQueue is still pending
    showContextMenuMock.mockResolvedValueOnce('toggleQueue');
    fireEvent.contextMenu(root);
    await Promise.resolve();

    // Only one toggle invocation should have been dispatched to native
    expect(window.api.miniPlayer.toggleMiniPlayerQueue).toHaveBeenCalledTimes(1);

    // Resolve the first toggle
    resolveFirstToggle!({ isExpanded: true, direction: 'up' });
    await screen.findByTestId('queue-container');
  });

  it('maintains constant minimum bounds regardless of volume hover state (resting geometry invariant)', async () => {
    // Mock getBoundingClientRect for controls container
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('mini-deck-controls')) {
        // Return 180px for the stable controls deck
        return { width: 180, height: 40, top: 0, left: 0, right: 180, bottom: 40 } as DOMRect;
      }
      return originalGetBoundingClientRect.apply(this);
    };

    try {
      queryClient.setQueryData(['settings'], {
        miniPlayerPinnedControls: ['play', 'volume'],
        isMiniPlayerAlwaysOnTop: false
      });

      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>Loading...</div>}>
            <MiniPlayer />
          </Suspense>
        </QueryClientProvider>
      );

      // Wait for requestAnimationFrame to fire measureAndSyncBounds
      await new Promise((r) => setTimeout(r, 50));

      expect(window.api.miniPlayer.setDynamicMinimumBounds).toHaveBeenCalled();
      const initialCall = (window.api.miniPlayer.setDynamicMinimumBounds as any).mock.calls.at(-1)[0];
      const restingMinWidth = initialCall.minWidth;

      // Hover over volume button
      const volumeBtn = container.querySelector('.volume-btn')!;
      expect(volumeBtn).not.toBeNull();
      fireEvent.mouseEnter(volumeBtn.parentElement!);
      await new Promise((r) => setTimeout(r, 50));

      // Re-verify that minWidth was NOT increased by volume slider expansion
      const hoverCall = (window.api.miniPlayer.setDynamicMinimumBounds as any).mock.calls.at(-1)[0];
      expect(hoverCall.minWidth).toBe(restingMinWidth);

      // Unhover
      fireEvent.mouseLeave(volumeBtn.parentElement!);
      await new Promise((r) => setTimeout(r, 50));

      const unhoverCall = (window.api.miniPlayer.setDynamicMinimumBounds as any).mock.calls.at(-1)[0];
      expect(unhoverCall.minWidth).toBe(restingMinWidth);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });

  it('dynamically recalculates minimum bounds when controls are pinned', async () => {
    let mockControlsWidth = 100;
    const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.classList.contains('mini-deck-controls')) {
        return { width: mockControlsWidth, height: 40, top: 0, left: 0, right: mockControlsWidth, bottom: 40 } as DOMRect;
      }
      return originalGetBoundingClientRect.apply(this);
    };

    try {
      queryClient.setQueryData(['settings'], {
        miniPlayerPinnedControls: ['play'],
        isMiniPlayerAlwaysOnTop: false
      });

      const { rerender } = render(
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>Loading...</div>}>
            <MiniPlayer />
          </Suspense>
        </QueryClientProvider>
      );

      await new Promise((r) => setTimeout(r, 50));

      const baseCall = (window.api.miniPlayer.setDynamicMinimumBounds as any).mock.calls.at(-1)[0];
      const baseMinWidth = baseCall.minWidth;

      // Simulate pinning artwork, title, and queue which increases controls width
      mockControlsWidth = 220;
      queryClient.setQueryData(['settings'], {
        miniPlayerPinnedControls: ['play', 'artwork', 'title', 'queue'],
        isMiniPlayerAlwaysOnTop: false
      });

      rerender(
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>Loading...</div>}>
            <MiniPlayer />
          </Suspense>
        </QueryClientProvider>
      );

      await new Promise((r) => setTimeout(r, 50));

      const updatedCall = (window.api.miniPlayer.setDynamicMinimumBounds as any).mock.calls.at(-1)[0];
      expect(updatedCall.minWidth).toBeGreaterThan(baseMinWidth);
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    }
  });
});
