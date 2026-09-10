// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaybackSettings } from '../../../../../src/renderer/src/hooks/usePlaybackSettings';
import type AudioPlayer from '../../../../../src/renderer/src/other/player';

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
      currentTime: 10,
      readyState: 4
    } as unknown as HTMLAudioElement;
  });

  describe('updateSongPosition with AudioPlayer', () => {
    it('delegates seeking to player.seek() and uses live AudioPlayer duration', () => {
      const mockSeek = vi.fn();
      const mockPlayer = {
        duration: 240,
        seek: mockSeek
      } as unknown as AudioPlayer;

      const { result } = renderHook(() => usePlaybackSettings(mockPlayer));

      act(() => {
        result.current.updateSongPosition(75);
      });

      expect(mockSeek).toHaveBeenCalledWith(75);
    });

    it('clamps seek to max(0, d - 0.1) when calling player.seek()', () => {
      const mockSeek = vi.fn();
      const mockPlayer = {
        duration: 200,
        seek: mockSeek
      } as unknown as AudioPlayer;

      const { result } = renderHook(() => usePlaybackSettings(mockPlayer));

      act(() => {
        result.current.updateSongPosition(200);
      });

      expect(mockSeek).toHaveBeenCalledWith(199.9);
    });
  });

  describe('updateSongPosition with HTMLAudioElement fallback', () => {
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

    it('guards against setting currentTime when readyState is 0 (pre-metadata) to prevent InvalidStateError', () => {
      fakeAudio.readyState = 0; // HAVE_NOTHING
      fakeAudio.currentTime = 0;
      fakeAudio.duration = Number.NaN;

      const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

      act(() => {
        result.current.updateSongPosition(30);
      });

      // Should not set currentTime when readyState is 0
      expect(fakeAudio.currentTime).toBe(0);
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

    it('catches and logs errors without throwing when player throws on seek', () => {
      const throwingAudio = {
        duration: 100,
        readyState: 4,
        get currentTime() {
          return 0;
        },
        set currentTime(_v: number) {
          throw new Error('InvalidStateError');
        }
      } as unknown as HTMLAudioElement;

      const { result } = renderHook(() => usePlaybackSettings(throwingAudio));

      expect(() => {
        act(() => {
          result.current.updateSongPosition(50);
        });
      }).not.toThrow();
    });
  });
});
