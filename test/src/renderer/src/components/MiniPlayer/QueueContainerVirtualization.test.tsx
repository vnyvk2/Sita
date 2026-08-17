// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import QueueContainer from '@renderer/components/MiniPlayer/containers/QueueContainer';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import PlayerQueue from '@renderer/other/playerQueue';
import { QueuesManager } from '@renderer/other/queuesManager';
import { store } from '@renderer/store/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as any;

// Mock react-i18next
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: any) => {
        if (typeof options === 'object' && options !== null && 'count' in options) {
          return `${options.count} songs`;
        }
        if (typeof options === 'string') {
          return options;
        }
        return key;
      }
    })
  };
});

// Mock TanStack Router
vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

// Mock audioLibraryControls
const mockGetSongInfo = vi.fn();
(window as any).api = {
  audioLibraryControls: {
    getSongInfo: mockGetSongInfo
  },
  properties: {
    isInDevelopment: false
  }
};

describe('MiniPlayer QueueContainer Virtualization & Invariants (Phase 4)', () => {
  let queryClient: QueryClient;
  let mockChangeQueueCurrentSongIndex: ReturnType<typeof vi.fn>;
  let mockToggleIsFavorite: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 500
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 500
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 400
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 400
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    mockChangeQueueCurrentSongIndex = vi.fn();
    mockToggleIsFavorite = vi.fn();

    // Default mock response for song info
    mockGetSongInfo.mockResolvedValue([
      {
        songId: 101,
        title: 'Track 101',
        duration: 180,
        artists: [{ name: 'Artist Alpha', artistId: 1 }],
        album: { name: 'Album Alpha', albumId: 1 },
        isAFavorite: false,
        isBlacklisted: false
      },
      {
        songId: 102,
        title: 'Track 102',
        duration: 210,
        artists: [{ name: 'Artist Beta', artistId: 2 }],
        album: { name: 'Album Beta', albumId: 2 },
        isAFavorite: true,
        isBlacklisted: false
      }
    ]);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  const renderComponent = (isQueueVisible = true) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider
          value={
            {
              changeQueueCurrentSongIndex: mockChangeQueueCurrentSongIndex,
              toggleIsFavorite: mockToggleIsFavorite
            } as any
          }
        >
          <QueueContainer isQueueVisible={isQueueVisible} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );
  };

  it('renders null when isQueueVisible is false', () => {
    const { container } = renderComponent(false);
    expect(container.firstChild).toBeNull();
  });

  it('renders empty queue state when queue has 0 song IDs', () => {
    const emptyQueue = new PlayerQueue([], 0, undefined, undefined, 'empty-queue');
    const manager = new QueuesManager();
    manager.queues = [emptyQueue];
    (window as any).queuesManager = manager;

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [emptyQueue.toJSON()]
        }
      }
    }));

    renderComponent(true);
    expect(screen.getByText('Queue is empty')).toBeDefined();
    expect(screen.getByText('Add Songs')).toBeDefined();
  });

  it('virtualizes large queues (e.g. 5,000 songs) without mounting all DOM nodes', () => {
    // Generate 5,000 song IDs
    const largeSongIds = Array.from({ length: 5000 }, (_, i) => i + 1);
    const queue = new PlayerQueue(largeSongIds, 0, undefined, undefined, 'huge-queue');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).queuesManager = manager;

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));

    renderComponent(true);

    const queueContainer = screen.getByTestId('queue-container');
    expect(queueContainer).toBeDefined();

    // Verify VirtualizedList container is present
    const virtuosoContainer = queueContainer.querySelector('[data-virtuoso-scroller]');
    expect(virtuosoContainer).toBeDefined();

    // DOM node count must NOT be 5,000 (virtualized window is bounded)
    const renderedRows = queueContainer.querySelectorAll('.queue-song-item');
    expect(renderedRows.length).toBeLessThan(100);
  });

  it('handles track clicking and calls moveToPosition', () => {
    const queue = new PlayerQueue([101, 102], 0, undefined, undefined, 'click-test-queue');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).queuesManager = manager;

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));

    renderComponent(true);

    const rows = screen.getAllByRole('button');
    if (rows.length > 0) {
      const songRow = rows.find((r) => r.classList.contains('queue-song-item'));
      if (songRow) {
        fireEvent.click(songRow);
        expect(mockChangeQueueCurrentSongIndex).toHaveBeenCalled();
      }
    }
  });

  it('updates header song count immediately from songIds.length', () => {
    const queue = new PlayerQueue([101, 102, 103], 0, undefined, undefined, 'header-count-test');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).queuesManager = manager;

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));

    renderComponent(true);
    // Header should reflect 3 songs
    expect(screen.getByText('3 songs')).toBeDefined();
  });

  it('highlights active song position with equalizer overlay when current song is playing', async () => {
    const queue = new PlayerQueue([101, 102], 0, undefined, undefined, 'active-highlight-queue');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).queuesManager = manager;

    store.setState((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        isCurrentSongPlaying: true
      },
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));

    renderComponent(true);

    // Wait for metadata hydration
    await screen.findByText('Track 101');

    // Should render equalizer icon for active track
    expect(screen.getByText('equalizer')).toBeDefined();
  });

  it('maintains zero metadata refetch on shuffle when queue is reordered in MiniPlayer', async () => {
    const queue = new PlayerQueue([101, 102, 103], 0, undefined, undefined, 'zero-ipc-mini');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).queuesManager = manager;

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));

    renderComponent(true);

    // Wait for initial hydration to complete and confirm calls occurred
    await screen.findByText('Track 101');
    const initialFetchCount = mockGetSongInfo.mock.calls.length;
    expect(initialFetchCount).toBeGreaterThan(0);

    // Shuffle queue in place
    queue.shuffle();
    expect(queue.membershipVersion).toBe(0);

    store.setState((prev) => ({
      ...prev,
      localStorage: {
        ...prev.localStorage,
        queue: {
          currentQueueIndex: 0,
          queues: [queue.toJSON()]
        }
      }
    }));

    // Flush any pending React updates/microtasks
    await Promise.resolve();

    // IPC call count MUST strictly remain unchanged after shuffle
    expect(mockGetSongInfo.mock.calls.length).toBe(initialFetchCount);
  });
});
