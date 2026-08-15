// @vitest-environment jsdom
import TitleBar from '@renderer/components/MiniPlayer/containers/TitleBarContainer';
import { store } from '@renderer/store/store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render } from '@testing-library/react';
import React, { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal: string) => defaultVal || key
    })
  };
});

vi.mock('@renderer/queries/settings', () => ({
  settingsQuery: {
    all: {
      queryKey: ['settings'],
      queryFn: () => ({
        hideWindowOnClose: false
      })
    }
  }
}));

describe('TitleBarContainer Hit-Test Safety', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false
        }
      }
    });

    window.api = {
      ...window.api,
      miniPlayer: {
        resetToDefaultPosition: vi.fn()
      },
      windowControls: {
        minimizeApp: vi.fn(),
        closeApp: vi.fn(),
        hideApp: vi.fn()
      }
    } as any;
  });

  afterEach(() => {
    cleanup();
  });

  it('renders with invisible class when playing to prevent accidental button hits, and visible when paused', () => {
    // 1. When playing
    store.setState((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        isCurrentSongPlaying: true
      }
    }));

    queryClient.setQueryData(['settings'], {
      hideWindowOnClose: false
    });

    const { container, rerender } = render(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <TitleBar isLyricsVisible={false} />
        </Suspense>
      </QueryClientProvider>
    );

    const titleBar = container.querySelector('.mini-player-title-bar')!;
    expect(titleBar).not.toBeNull();
    expect(titleBar.className).toContain('invisible');
    expect(titleBar.className).toContain('opacity-0');

    // 2. When paused
    store.setState((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        isCurrentSongPlaying: false
      }
    }));

    rerender(
      <QueryClientProvider client={queryClient}>
        <Suspense fallback={<div>Loading...</div>}>
          <TitleBar isLyricsVisible={false} />
        </Suspense>
      </QueryClientProvider>
    );

    expect(titleBar.className).toContain('visible');
    expect(titleBar.className).toContain('opacity-100');
    expect(titleBar.className).not.toContain('invisible');
  });
});
