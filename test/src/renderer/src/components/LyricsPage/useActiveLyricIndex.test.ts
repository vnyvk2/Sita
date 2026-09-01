import { useActiveLyricIndex } from '@renderer/components/LyricsPage/useActiveLyricIndex';
import { renderHook, act } from '@testing-library/react';
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';

describe('useActiveLyricIndex Monotonic & Binary Search Resolution (Phase L3)', () => {
  const mockSyncedLyrics: SongLyrics = {
    isOfflineLyricsAvailable: false,
    lyrics: {
      copyright: 'Test',
      isSynced: true,
      offset: 0,
      parsedLyrics: [
        { start: 5, end: 10, originalText: 'Line 0' },
        { start: 10, end: 20, originalText: 'Line 1' },
        { start: 20, end: 35, originalText: 'Line 2' },
        { start: 35, end: 60, originalText: 'Line 3' },
        { start: 60, end: 100, originalText: 'Line 4' },
        { start: 100, end: 150, originalText: 'Line 5' }
      ]
    }
  };

  const dispatchPosition = (pos: number) => {
    act(() => {
      document.dispatchEvent(new CustomEvent('player/positionChange', { detail: pos }));
    });
  };

  it('returns -1 for intro line before first timestamp', () => {
    const { result } = renderHook(() => useActiveLyricIndex(mockSyncedLyrics));

    dispatchPosition(2);
    expect(result.current).toBe(-1);
  });

  it('monotonically progresses through sequential lines (O(1) fast-path)', () => {
    const { result } = renderHook(() => useActiveLyricIndex(mockSyncedLyrics));

    // Line 0
    dispatchPosition(6);
    expect(result.current).toBe(0);

    // Still in Line 0 (same line fast-path)
    dispatchPosition(8);
    expect(result.current).toBe(0);

    // Transition to Line 1 (immediate next line fast-path)
    dispatchPosition(11);
    expect(result.current).toBe(1);

    // Transition to Line 2
    dispatchPosition(25);
    expect(result.current).toBe(2);

    // Transition to Line 3
    dispatchPosition(40);
    expect(result.current).toBe(3);
  });

  it('resolves jumps and seeks via O(log N) binary search', () => {
    const { result } = renderHook(() => useActiveLyricIndex(mockSyncedLyrics));

    // Start at line 0
    dispatchPosition(6);
    expect(result.current).toBe(0);

    // Seek forward to Line 5 (120s)
    dispatchPosition(120);
    expect(result.current).toBe(5);

    // Seek backward to Line 1 (15s)
    dispatchPosition(15);
    expect(result.current).toBe(1);

    // Seek backward to Line 4 (75s)
    dispatchPosition(75);
    expect(result.current).toBe(4);
  });

  it('handles gap regions and position past end of song', () => {
    const lyricsWithGap: SongLyrics = {
      isOfflineLyricsAvailable: false,
      lyrics: {
        copyright: 'Test',
        isSynced: true,
        offset: 0,
        parsedLyrics: [
          { start: 10, end: 20, originalText: 'Line 0' },
          { start: 40, end: 50, originalText: 'Line 1' }
        ]
      }
    };

    const { result } = renderHook(() => useActiveLyricIndex(lyricsWithGap));

    dispatchPosition(15);
    expect(result.current).toBe(0);

    // In the gap between 20s and 40s
    dispatchPosition(30);
    expect(result.current).toBeNull();

    // In line 1
    dispatchPosition(45);
    expect(result.current).toBe(1);

    // Past line 1
    dispatchPosition(60);
    expect(result.current).toBeNull();
  });
});
