import { describe, expect, it } from 'vitest';

import {
  computeLyricLoopRange,
  DEFAULT_POST_ROLL,
  DEFAULT_PRE_ROLL
} from '../../../../../src/renderer/src/utils/lyricLoopRange';

describe('computeLyricLoopRange (Phase 3)', () => {
  it('applies full pre-roll and post-roll when ample gaps exist', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: 8.0,
      nextStart: 16.0,
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(10.0 - DEFAULT_PRE_ROLL, 5); // 9.85
    expect(result.end).toBeCloseTo(14.0 + DEFAULT_POST_ROLL, 5); // 14.25
  });

  it('clamps pre-roll to prevEnd when predecessor gap is tighter than pre-roll', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: 9.92, // gap is 0.08s < 0.15s
      nextStart: 16.0,
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(9.92, 5);
    expect(result.end).toBeCloseTo(14.25, 5);
  });

  it('clamps post-roll to nextStart when successor gap is tighter than post-roll', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: 8.0,
      nextStart: 14.1, // gap is 0.10s < 0.25s
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(9.85, 5);
    expect(result.end).toBeCloseTo(14.1, 5);
  });

  it('handles Overlap-A (prevEnd > syncedStart) without cutting into the line start', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: 10.5, // overlapping line ends after current starts
      nextStart: 16.0,
      songDuration: 200
    });

    expect(result.success).toBe(true);
    // Regime 3: Never cut into current line, clamp to syncedStart
    expect(result.start).toBe(10.0);
    expect(result.end).toBeCloseTo(14.25, 5);
  });

  it('handles Overlap-B (nextStart < syncedEnd) without cutting off the line end', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: 8.0,
      nextStart: 13.5, // next line begins before current ends
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(9.85, 5);
    // Regime 3: Never cut off current line, clamp to syncedEnd
    expect(result.end).toBe(14.0);
  });

  it('works cleanly when neighbors are undefined (missing neighbors)', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: undefined,
      nextStart: undefined,
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(9.85, 5);
    expect(result.end).toBeCloseTo(14.25, 5);
  });

  it('clamps start to 0 for the first line in a song near t=0', () => {
    const result = computeLyricLoopRange({
      syncedStart: 0.05,
      syncedEnd: 4.0,
      prevEnd: undefined,
      nextStart: 6.0,
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBe(0);
    expect(result.end).toBeCloseTo(4.25, 5);
  });

  it('clamps end to songDuration for the final line in a song near duration', () => {
    const result = computeLyricLoopRange({
      syncedStart: 195.0,
      syncedEnd: 199.9,
      prevEnd: 190.0,
      nextStart: undefined,
      songDuration: 200.0
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(194.85, 5);
    expect(result.end).toBe(200.0);
  });

  it('asserts zero post-roll on derived end where syncedEnd === nextStart', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 14.0,
      prevEnd: 8.0,
      nextStart: 14.0, // contiguous timestamp
      songDuration: 200
    });

    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(9.85, 5);
    expect(result.end).toBe(14.0); // zero post-roll
  });

  it('rescues a micro-line (< 0.25s) when roomy neighbors allow padding to exceed 0.25s', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 10.2, // duration is only 0.20s
      prevEnd: 8.0,
      nextStart: 12.0,
      songDuration: 200
    });

    // Padded: 9.85 to 10.45 = 0.60s >= 0.25s
    expect(result.success).toBe(true);
    expect(result.start).toBeCloseTo(9.85, 5);
    expect(result.end).toBeCloseTo(10.45, 5);
  });

  it('rejects a micro-line (< 0.25s) when tight neighbors prevent padding expansion', () => {
    const result = computeLyricLoopRange({
      syncedStart: 10.0,
      syncedEnd: 10.2, // duration is 0.20s
      prevEnd: 10.0, // tightly clamped start
      nextStart: 10.2, // tightly clamped end
      songDuration: 200
    });

    expect(result.success).toBe(false);
    expect(result.reason).toContain('at least 0.25 seconds');
  });

  it('rejects invalid or inverted timestamps', () => {
    expect(
      computeLyricLoopRange({
        syncedStart: 10.0,
        syncedEnd: 10.0
      }).success
    ).toBe(false);

    expect(
      computeLyricLoopRange({
        syncedStart: 15.0,
        syncedEnd: 10.0
      }).success
    ).toBe(false);

    expect(
      computeLyricLoopRange({
        syncedStart: Number.NaN,
        syncedEnd: 10.0
      }).success
    ).toBe(false);
  });
});
