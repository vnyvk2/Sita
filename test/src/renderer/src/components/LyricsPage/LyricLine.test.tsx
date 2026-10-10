// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import LyricLine from '@renderer/components/LyricsPage/LyricLine';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, defaultVal?: any) => (typeof defaultVal === 'string' ? defaultVal : key)
  })
}));

vi.mock('@renderer/hooks/useAudioPlayer', () => ({
  useAudioPlayer: () => ({
    setAbLoopRange: vi.fn(),
    setAbLoopPointA: vi.fn(),
    setAbLoopPointB: vi.fn(),
    clearAbLoop: vi.fn(),
    getAbLoopState: () => ({ phase: 'idle', pointA: null, pointB: null }),
    seek: vi.fn()
  })
}));

describe('LyricLine Fullscreen Kinetic Depth-of-Field & Interlude Orbs', () => {
  afterEach(() => {
    cleanup();
  });

  const renderLine = (props: React.ComponentProps<typeof LyricLine>) =>
    render(
      <AppUpdateContext.Provider
        value={
          {
            updateSongPosition: vi.fn(),
            updateContextMenuData: vi.fn(),
            addNewNotifications: vi.fn()
          } as any
        }
      >
        <LyricLine {...props} />
      </AppUpdateContext.Provider>
    );

  it('applies progressive depth-of-field blur classes based on distance from activeLineIndex in fullscreen mode', () => {
    const { rerender } = renderLine({
      index: 5,
      activeLineIndex: 5,
      isActive: true,
      lyric: 'Active Chorus Line',
      syncedStart: 10,
      syncedEnd: 15,
      playerType: 'full',
      selfScroll: false
    });

    const activeEl = document.querySelector('[data-lyric-line="true"]')!;
    expect(activeEl.className).toContain('blur-none!');
    expect(activeEl.className).toContain('scale-100!');

    // Distance 1
    rerender(
      <AppUpdateContext.Provider
        value={{ updateSongPosition: vi.fn(), updateContextMenuData: vi.fn() } as any}
      >
        <LyricLine
          index={6}
          activeLineIndex={5}
          isActive={false}
          lyric="Next Line"
          syncedStart={15}
          syncedEnd={20}
          playerType="full"
          selfScroll={false}
        />
      </AppUpdateContext.Provider>
    );
    expect(activeEl.className).toContain('blur-[0.5px]!');
    expect(activeEl.className).toContain('scale-[0.88]!');

    // Distance 2
    rerender(
      <AppUpdateContext.Provider
        value={{ updateSongPosition: vi.fn(), updateContextMenuData: vi.fn() } as any}
      >
        <LyricLine
          index={7}
          activeLineIndex={5}
          isActive={false}
          lyric="Two Lines Away"
          syncedStart={20}
          syncedEnd={25}
          playerType="full"
          selfScroll={false}
        />
      </AppUpdateContext.Provider>
    );
    expect(activeEl.className).toContain('blur-[1.5px]!');
    expect(activeEl.className).toContain('scale-[0.80]!');

    // Distance >= 3
    rerender(
      <AppUpdateContext.Provider
        value={{ updateSongPosition: vi.fn(), updateContextMenuData: vi.fn() } as any}
      >
        <LyricLine
          index={9}
          activeLineIndex={5}
          isActive={false}
          lyric="Far Line"
          syncedStart={25}
          syncedEnd={30}
          playerType="full"
          selfScroll={false}
        />
      </AppUpdateContext.Provider>
    );
    expect(activeEl.className).toContain('blur-[2.5px]!');
    expect(activeEl.className).toContain('scale-75!');
  });

  it('renders 3 breathing interlude orbs when synced line text is •••', () => {
    renderLine({
      index: -1,
      activeLineIndex: -1,
      isActive: true,
      lyric: '•••',
      syncedStart: 0,
      syncedEnd: 8,
      playerType: 'full',
      selfScroll: false
    });

    const orbsContainer = screen.getByTestId('lyrics-interlude-orbs');
    expect(orbsContainer).toBeDefined();
    expect(orbsContainer.querySelectorAll('span').length).toBe(3);
  });
});
