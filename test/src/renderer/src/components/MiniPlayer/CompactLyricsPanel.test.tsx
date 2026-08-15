// @vitest-environment jsdom
import { store } from '@renderer/store/store';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CompactLyricsPanel from '../../../../../../src/renderer/src/components/MiniPlayer/CompactLyricsPanel';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultVal?: string) => defaultVal || key
    })
  };
});

describe('CompactLyricsPanel (3-Line Focused Synced Lyrics Panel)', () => {
  const mockGetSongLyrics = vi.fn();

  beforeEach(() => {
    window.api = {
      ...window.api,
      lyrics: {
        getSongLyrics: mockGetSongLyrics,
        getTranslatedLyrics: vi.fn(),
        convertLyricsToPinyin: vi.fn(),
        romanizeLyrics: vi.fn(),
        convertLyricsToRomaja: vi.fn()
      }
    } as any;

    store.setState((prev) => ({
      ...prev,
      currentSongData: {
        ...prev.currentSongData,
        songId: 1,
        title: 'Floating Track',
        artists: [{ name: 'Floating Artist', artistId: '1' }],
        path: '/path/song.mp3',
        duration: 180
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
    vi.clearAllMocks();
  });

  it('renders 3-line focused synced lyrics and updates active line on position change', async () => {
    mockGetSongLyrics.mockResolvedValue({
      lyrics: {
        isSynced: true,
        parsedLyrics: [
          { start: 0, end: 10, originalText: 'First line of the song' },
          { start: 10, end: 20, originalText: 'Second active line of the song' },
          { start: 20, end: 30, originalText: 'Third upcoming line of the song' },
          { start: 30, end: 40, originalText: 'Fourth line' }
        ]
      },
      source: 'LRCLIB'
    });

    const handleClose = vi.fn();
    render(<CompactLyricsPanel isLyricsVisible={true} onClose={handleClose} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Simulate playback position reaching 15 seconds (active on line 2)
    act(() => {
      const posEvent = new CustomEvent('player/positionChange', { detail: 15 });
      document.dispatchEvent(posEvent);
    });

    expect(screen.getByText('First line of the song')).not.toBeNull();
    expect(screen.getByText('Second active line of the song')).not.toBeNull();
    expect(screen.getByText('Third upcoming line of the song')).not.toBeNull();
    expect(screen.getByText('LRCLIB')).not.toBeNull();
  });

  it('renders unsynced plain-text lyrics when isSynced is false', async () => {
    mockGetSongLyrics.mockResolvedValue({
      lyrics: {
        isSynced: false,
        parsedLyrics: [
          { originalText: 'Unsynced verse 1' },
          { originalText: 'Unsynced verse 2' }
        ]
      },
      source: 'Musixmatch'
    });

    render(<CompactLyricsPanel isLyricsVisible={true} onClose={vi.fn()} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByText('Unsynced verse 1')).not.toBeNull();
    expect(screen.getByText('Unsynced verse 2')).not.toBeNull();
  });

  it('invokes onClose callback when close button is clicked', async () => {
    mockGetSongLyrics.mockResolvedValue(null);
    const handleClose = vi.fn();

    const { container } = render(
      <CompactLyricsPanel isLyricsVisible={true} onClose={handleClose} />
    );

    const closeBtn = container.querySelector('button[title="Close"]')!;
    fireEvent.click(closeBtn);

    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
