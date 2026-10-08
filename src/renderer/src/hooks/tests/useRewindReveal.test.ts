// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  REWIND_REVEAL_EVENT,
  rewindRevealThreshold,
  shouldRevealRewind,
  useRewindReveal
} from '../useRewindReveal';

describe('rewindRevealThreshold', () => {
  it('scales with duration within floor/ceiling bounds', () => {
    expect(rewindRevealThreshold(0)).toBe(10);
    expect(rewindRevealThreshold(30)).toBe(5);
    expect(rewindRevealThreshold(200)).toBe(15);
    expect(rewindRevealThreshold(100)).toBeCloseTo(8, 5);
  });
});

describe('shouldRevealRewind', () => {
  it('reveals only once dragged back past the threshold', () => {
    expect(shouldRevealRewind(120, 100, 200)).toBe(true);
    expect(shouldRevealRewind(120, 110, 200)).toBe(false);
    expect(shouldRevealRewind(100, 120, 200)).toBe(false);
  });
});

describe('useRewindReveal', () => {
  it('toggles on reveal signals and resets on track change', () => {
    const { result, rerender } = renderHook(({ songId }) => useRewindReveal(songId), {
      initialProps: { songId: 7 }
    });
    expect(result.current).toBe(false);

    act(() => {
      document.dispatchEvent(new CustomEvent(REWIND_REVEAL_EVENT, { detail: { active: true } }));
    });
    expect(result.current).toBe(true);

    act(() => {
      document.dispatchEvent(new CustomEvent(REWIND_REVEAL_EVENT, { detail: { active: false } }));
    });
    expect(result.current).toBe(false);

    act(() => {
      document.dispatchEvent(new CustomEvent(REWIND_REVEAL_EVENT, { detail: { active: true } }));
    });
    expect(result.current).toBe(true);

    rerender({ songId: 8 });
    expect(result.current).toBe(false);
  });

  it('ignores malformed signals', () => {
    const { result } = renderHook(() => useRewindReveal(1));
    act(() => {
      document.dispatchEvent(new CustomEvent(REWIND_REVEAL_EVENT, { detail: { active: 'yes' } }));
    });
    expect(result.current).toBe(false);
  });
});
