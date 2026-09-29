import { describe, expect, it } from 'vitest';

describe('useWindowHydration dynamic lookahead overscan formula', () => {
  const computeOverscan = (rowHeight: number) => ({
    extraRowsBefore: Math.ceil(4500 / rowHeight),
    extraRowsAfter: Math.ceil(9000 / rowHeight)
  });

  it('computes exact overscan rows for Compact 38px tier (119 / 237)', () => {
    const { extraRowsBefore, extraRowsAfter } = computeOverscan(38);
    expect(extraRowsBefore).toBe(119);
    expect(extraRowsAfter).toBe(237);
  });

  it('computes exact overscan rows for Small 48px tier (94 / 188)', () => {
    const { extraRowsBefore, extraRowsAfter } = computeOverscan(48);
    expect(extraRowsBefore).toBe(94);
    expect(extraRowsAfter).toBe(188);
  });

  it('computes exact overscan rows for Normal 60px tier (75 / 150)', () => {
    const { extraRowsBefore, extraRowsAfter } = computeOverscan(60);
    expect(extraRowsBefore).toBe(75);
    expect(extraRowsAfter).toBe(150);
  });
});
