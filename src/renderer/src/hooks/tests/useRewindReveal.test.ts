// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  REWIND_REVEAL_EDGE_S,
  REWIND_REVEAL_EVENT,
  setRewindRevealState,
  shouldRevealRewind,
  toggleRewindReveal,
  useRewindReveal
} from '../useRewindReveal';

describe('shouldRevealRewind', () => {
  it('reveals only when parked at the very start after coming from further in', () => {
    expect(shouldRevealRewind(120, 0)).toBe(true);
    expect(shouldRevealRewind(3, 0)).toBe(true);
    expect(shouldRevealRewind(0.2, 0)).toBe(false);
  });

  it('never reveals on mid-song scrubbing, however far back', () => {
    expect(shouldRevealRewind(150, 130)).toBe(false);
    expect(shouldRevealRewind(150, REWIND_REVEAL_EDGE_S + 0.1)).toBe(false);
    expect(shouldRevealRewind(100, 50)).toBe(false);
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

  it('supports toggleRewindReveal and setRewindRevealState', () => {
    const { result } = renderHook(() => useRewindReveal(1));
    expect(result.current).toBe(false);

    act(() => {
      toggleRewindReveal();
    });
    expect(result.current).toBe(true);

    act(() => {
      toggleRewindReveal();
    });
    expect(result.current).toBe(false);

    act(() => {
      setRewindRevealState(true);
    });
    expect(result.current).toBe(true);

    act(() => {
      setRewindRevealState(false);
    });
    expect(result.current).toBe(false);
  });
});
