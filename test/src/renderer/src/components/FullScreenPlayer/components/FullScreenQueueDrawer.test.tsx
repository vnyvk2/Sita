// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import FullScreenQueueDrawer from '@renderer/components/FullScreenPlayer/components/FullScreenQueueDrawer';
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
      t: (key: string, options?: any) => {
        if (typeof options === 'object' && options !== null && 'count' in options) {
          return `${options.count} songs`;
        }
        if (typeof options === 'string') return options;
        return key;
      }
    })
  };
});

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn()
}));

const mockGetSongInfo = vi.fn();
(window as any).api = {
  audioLibraryControls: {
    getSongInfo: mockGetSongInfo
  },
  properties: {
    isInDevelopment: false
  }
};

describe('FullScreenQueueDrawer', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      value: 600
    });
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 600
    });
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      value: 420
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 420
    });

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } }
    });

    mockGetSongInfo.mockResolvedValue([
      {
        songId: 101,
        title: 'Midnight City',
        duration: 243,
        artists: [{ name: 'M83', artistId: 1 }],
        album: { name: 'Hurry Up, We Are Dreaming', albumId: 1 },
        isAFavorite: true,
        isBlacklisted: false
      }
    ]);
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it('propagates full flex-col height to QueueContainer and renders queue songs when open', async () => {
    const queue = new PlayerQueue([101], 0, undefined, undefined, 'fs-queue');
    const manager = new QueuesManager();
    manager.queues = [queue];
    (window as any).__NORA_QUEUES_MANAGER__ = manager;

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

    const onClose = vi.fn();
    render(
      <QueryClientProvider client={queryClient}>
        <AppUpdateContext.Provider
          value={
            {
              changeQueueCurrentSongIndex: vi.fn(),
              toggleIsFavorite: vi.fn(),
              updatePlayerType: vi.fn()
            } as any
          }
        >
          <FullScreenQueueDrawer isOpen={true} onClose={onClose} />
        </AppUpdateContext.Provider>
      </QueryClientProvider>
    );

    const drawer = screen.getByTestId('fullscreen-queue-drawer');
    expect(drawer.className).toContain('z-50');
    expect(drawer.className).toContain('[-webkit-app-region:no-drag]');
    expect(drawer.className).toContain('translate-x-0');

    const queueContainer = screen.getByTestId('queue-container');
    expect(queueContainer.className).toContain('h-full');
    expect(queueContainer.parentElement?.className).toContain('flex');
    expect(queueContainer.parentElement?.className).toContain('flex-col');
    expect(queueContainer.parentElement?.className).toContain('h-full');

    await screen.findByText('Midnight City');

    fireEvent.click(screen.getByTestId('fullscreen-queue-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
