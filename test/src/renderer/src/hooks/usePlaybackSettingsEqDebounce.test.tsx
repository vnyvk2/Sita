// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePlaybackSettings } from '../../../../../src/renderer/src/hooks/usePlaybackSettings';
import type AudioPlayer from '../../../../../src/renderer/src/other/player';

vi.mock('../../../../../src/renderer/src/hooks/useUserPreferences', () => {
  const fn = vi.fn();
  (globalThis as any).__eqSaveMock = fn;
  return {
    useUserPreferences: () => ({
      saveEqualizerPreset: fn
    })
  };
});

function saveMock() {
  return (globalThis as any).__eqSaveMock as ReturnType<typeof vi.fn>;
}

const basePreset = {
  thirtyTwoHertzFilter: 0,
  sixtyFourHertzFilter: 0,
  hundredTwentyFiveHertzFilter: 0,
  twoHundredFiftyHertzFilter: 0,
  fiveHundredHertzFilter: 0,
  thousandHertzFilter: 0,
  twoThousandHertzFilter: 0,
  fourThousandHertzFilter: 0,
  eightThousandHertzFilter: 0,
  sixteenThousandHertzFilter: 0
} as any;

describe('usePlaybackSettings EQ persist debounce (T-UI-DEBOUNCE)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    saveMock().mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses a slider-drag burst into one DB write with the latest preset while DSP stays live', () => {
    const applyMock = vi.fn();
    const player = { applyEqualizerPreset: applyMock } as unknown as AudioPlayer;
    const { result } = renderHook(() => usePlaybackSettings(player));

    for (let i = 1; i <= 5; i++) {
      act(() => {
        result.current.updateEqualizerOptions({ ...basePreset, thousandHertzFilter: i } as any);
      });
    }

    // Audible path: live and unthrottled.
    expect(applyMock).toHaveBeenCalledTimes(5);
    expect(applyMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ thousandHertzFilter: 5 })
    );
    // Persist path: nothing written mid-drag.
    expect(saveMock()).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(saveMock()).toHaveBeenCalledTimes(1);
    expect(saveMock()).toHaveBeenLastCalledWith(
      expect.objectContaining({ thousandHertzFilter: 5 })
    );
  });

  it('fires on the trailing edge only', () => {
    const player = { applyEqualizerPreset: vi.fn() } as unknown as AudioPlayer;
    const { result } = renderHook(() => usePlaybackSettings(player));

    act(() => {
      result.current.updateEqualizerOptions(basePreset);
    });
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(saveMock()).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(saveMock()).toHaveBeenCalledTimes(1);
  });

  it('drops the pending write on unmount without crashing', () => {
    const player = { applyEqualizerPreset: vi.fn() } as unknown as AudioPlayer;
    const { result, unmount } = renderHook(() => usePlaybackSettings(player));

    act(() => {
      result.current.updateEqualizerOptions(basePreset);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(saveMock()).not.toHaveBeenCalled();
  });

  it('works with the legacy element fallback that has no EQ graph', () => {
    const fakeAudio = {} as unknown as AudioPlayer;
    const { result } = renderHook(() => usePlaybackSettings(fakeAudio));

    act(() => {
      result.current.updateEqualizerOptions(basePreset);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(saveMock()).toHaveBeenCalledTimes(1);
  });
});
