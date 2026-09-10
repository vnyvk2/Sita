// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaybackSettings } from '../../../../../src/renderer/src/hooks/usePlaybackSettings';

vi.mock('../../../../../src/renderer/src/hooks/useUserPreferences', () => ({
  useUserPreferences: () => ({
    saveEqualizerPreset: vi.fn()
  })
}));

describe('usePlaybackSettings', () => {
  let fakeAudio: HTMLAudioElement;

  beforeEach(() => {
    fakeAudio = {
      duration: 180,
      currentTime: 10
    } as unknown as HTMLAudioElement;
  });

  describe('updateSongPosition', () => {
    it('sets player.currentTime to target position when within valid bounds', () => {
      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        result.current.updateSongPosition(45);
      });

      expect(fakeAudio.currentTime).toBe(45);
    });

    it('clamps to (duration - 0.1) when target position exceeds player.duration to prevent silent drops and premature ended trigger', () => {
      fakeAudio.duration = 180;
      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        // Taglib duration was 185, user clicked 182, but audio element decoded duration is 180
        result.current.updateSongPosition(182);
      });

      expect(fakeAudio.currentTime).toBeCloseTo(179.9, 2);
    });

    it('clamps to (duration - 0.1) when target position is exactly equal to duration', () => {
      fakeAudio.duration = 100;
      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        result.current.updateSongPosition(100);
      });

      expect(fakeAudio.currentTime).toBeCloseTo(99.9, 2);
    });

    it('ignores negative position values', () => {
      fakeAudio.currentTime = 20;
      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        result.current.updateSongPosition(-5);
      });

      expect(fakeAudio.currentTime).toBe(20);
    });

    it('ignores NaN, Infinity, and non-finite values safely without throwing', () => {
      fakeAudio.currentTime = 20;
      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        result.current.updateSongPosition(Number.NaN);
      });
      expect(fakeAudio.currentTime).toBe(20);

      act(() => {
        result.current.updateSongPosition(Number.POSITIVE_INFINITY);
      });
      expect(fakeAudio.currentTime).toBe(20);

      act(() => {
        result.current.updateSongPosition(Number.NEGATIVE_INFINITY);
      });
      expect(fakeAudio.currentTime).toBe(20);
    });

    it('allows seeking to target position when player.duration is 0 or NaN before loadedmetadata', () => {
      fakeAudio.duration = Number.NaN;
      fakeAudio.currentTime = 0;
      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        result.current.updateSongPosition(30);
      });

      expect(fakeAudio.currentTime).toBe(30);
    });

    it('handles player being undefined/null gracefully', () => {
      const { result } = renderHook(() =>
        usePlaybackSettings(null as unknown as HTMLAudioElement)
      );

      expect(() => {
        act(() => {
          result.current.updateSongPosition(30);
        });
      }).not.toThrow();
    });
  });
});
