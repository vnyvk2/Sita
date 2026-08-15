// @vitest-environment jsdom
import { store } from '@renderer/store/store';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CompactMiniPlayer from '../../../../../../src/renderer/src/components/MiniPlayer/CompactMiniPlayer';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: string) => defaultVal || key
    })
  };
});

vi.mock('../../../../../../src/renderer/src/components/Img', () => ({
  default: ({ fallbackSrc, ...props }: any) => <img {...props} alt="Song Cover" />
}));

vi.mock('../../../../../../src/renderer/src/components/SeekBarSlider', () => ({
  default: () => <div data-testid="compact-seek-slider" />
}));

vi.mock('../../../../../../src/renderer/src/components/VolumeSlider', () => ({
  default: () => <div data-testid="compact-volume-slider" />
}));

describe('CompactMiniPlayer (Single-Tier Progressive Strip)', () => {
  beforeEach(() => {
    global.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as any;

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 1,
        title: 'Compact Track',
        artists: [{ name: 'Compact Artist', artistId: '1' }],
        artworkPath: 'path/to/artwork.jpg',
        isKnownSource: true
      },
      player: {
        ...prev.player,
        isCurrentSongPlaying: true,
        volume: { value: 75, isMuted: false },
        isRepeating: 'false',
        isShuffling: false
      }
    }));
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the core invariant elements: artwork, metadata, and core Previous/Play/Next controls', () => {
    render(
      <CompactMiniPlayer
        isQueueVisible={false}
        isLyricsVisible={false}
        onToggleQueue={vi.fn()}
        onToggleLyrics={vi.fn()}
        pinnedControls={['love', 'volume']}
      />
    );

    // Artwork & Metadata
    expect(screen.getByAltText('Song Cover')).not.toBeNull();
    expect(screen.getByText('Compact Track')).not.toBeNull();
    expect(screen.getByText('Compact Artist')).not.toBeNull();

    // Core 3 Playback Invariant Controls
    expect(screen.getByTitle('player.prevSong')).not.toBeNull();
    expect(screen.getByTitle('player.playPause')).not.toBeNull();
    expect(screen.getByTitle('player.nextSong')).not.toBeNull();

    // Micro seekbar
    expect(screen.getByTestId('compact-seek-slider')).not.toBeNull();
  });

  it('progressively reveals optional pinned controls based on available width budget', () => {
    const { container, rerender } = render(
      <CompactMiniPlayer
        isQueueVisible={false}
        isLyricsVisible={false}
        onToggleQueue={vi.fn()}
        onToggleLyrics={vi.fn()}
        pinnedControls={['love', 'volume', 'queue', 'lyrics', 'shuffle', 'repeat']}
      />
    );

    // Initial render defaults containerWidth to 300px, which budgets slots for high-priority controls
    expect(screen.getByTestId('compact-mini-player')).not.toBeNull();
    expect(container.querySelector('.favorite-btn')).not.toBeNull();
    expect(container.querySelector('.volume-btn')).not.toBeNull();

    // When pinnedControls excludes volume and love, they do not appear even with available width
    rerender(
      <CompactMiniPlayer
        isQueueVisible={false}
        isLyricsVisible={false}
        onToggleQueue={vi.fn()}
        onToggleLyrics={vi.fn()}
        pinnedControls={['queue']}
      />
    );

    expect(container.querySelector('.favorite-btn')).toBeNull();
    expect(container.querySelector('.volume-btn')).toBeNull();
    expect(container.querySelector('.queue-btn')).not.toBeNull();
  });

  it('triggers contextmenu event on two-finger tap in Compact Mode', () => {
    const { container } = render(
      <CompactMiniPlayer
        isQueueVisible={false}
        isLyricsVisible={false}
        onToggleQueue={vi.fn()}
        onToggleLyrics={vi.fn()}
        pinnedControls={['love']}
      />
    );

    const compactPlayer = container.querySelector('.compact-mini-player')!;
    const contextMenuHandler = vi.fn();
    compactPlayer.addEventListener('contextmenu', contextMenuHandler);

    // Simulate two-finger touch
    const touchStartEvent = new Event('touchstart', { bubbles: true });
    Object.defineProperty(touchStartEvent, 'touches', {
      value: [{ clientX: 10, clientY: 10 }, { clientX: 20, clientY: 20 }]
    });
    compactPlayer.dispatchEvent(touchStartEvent);

    const touchEndEvent = new Event('touchend', { bubbles: true });
    Object.defineProperty(touchEndEvent, 'touches', { value: [] });
    compactPlayer.dispatchEvent(touchEndEvent);

    expect(contextMenuHandler).toHaveBeenCalledTimes(1);
  });
});
