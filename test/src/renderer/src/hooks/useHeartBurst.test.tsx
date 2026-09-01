// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useHeartBurst, {
  HEART_BURST_DURATION_MS
} from '../../../../../src/renderer/src/hooks/useHeartBurst';

describe('useHeartBurst hook lifecycle and animation restart', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Explicitly flushes the double requestAnimationFrame sequence without relying on fixed
   * magic-number time assumptions (e.g. 32ms).
   */
  const flushDoubleRaf = () => {
    act(() => {
      // 1st rAF: initial frame boundary
      vi.advanceTimersToNextTimer();
      // 2nd rAF: DOM unmount/remount settle frame
      vi.advanceTimersToNextTimer();
    });
  };

  it('initializes with isBursting as false', () => {
    const { result } = renderHook(() => useHeartBurst());
    expect(result.current.isBursting).toBe(false);
  });

  it('sets isBursting to true after double rAF and resets after duration', () => {
    const { result } = renderHook(() => useHeartBurst(850));

    act(() => {
      result.current.triggerBurst();
    });

    // Before rAF fires
    expect(result.current.isBursting).toBe(false);

    // Explicitly advance through double rAF frames
    flushDoubleRaf();

    expect(result.current.isBursting).toBe(true);

    // Advance to end of burst
    act(() => {
      vi.advanceTimersByTime(850);
    });

    expect(result.current.isBursting).toBe(false);
  });

  it('safely handles rapid successive triggers without leaking timers', () => {
    const { result } = renderHook(() => useHeartBurst(HEART_BURST_DURATION_MS));

    act(() => {
      result.current.triggerBurst();
    });

    flushDoubleRaf();
    expect(result.current.isBursting).toBe(true);

    // Re-trigger halfway
    act(() => {
      result.current.triggerBurst();
    });

    flushDoubleRaf();
    expect(result.current.isBursting).toBe(true);

    // Old timer expiry should not set isBursting to false prematurely
    act(() => {
      vi.advanceTimersByTime(HEART_BURST_DURATION_MS);
    });
    expect(result.current.isBursting).toBe(false);
  });

  it('cancels pending timeouts and rAFs on unmount', () => {
    const { result, unmount } = renderHook(() => useHeartBurst());

    act(() => {
      result.current.triggerBurst();
    });

    unmount();

    // Advancing timers after unmount should not throw or update unmounted state
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }).not.toThrow();
  });
});
