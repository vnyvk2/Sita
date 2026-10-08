// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { artSlotColor } from '@renderer/components/SongsPage/artSlotColor';

describe('artSlotColor', () => {
  it('returns a valid hsl color string', () => {
    expect(artSlotColor(42)).toMatch(/^hsl\(\d{1,3} 28% 26%\)$/);
  });

  it('is deterministic for the same songId', () => {
    expect(artSlotColor(12345)).toBe(artSlotColor(12345));
  });

  it('keeps hue within 0-359', () => {
    for (let id = 0; id < 5000; id += 37) {
      const hue = Number(artSlotColor(id).match(/^hsl\((\d+) /)?.[1]);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it('varies across songIds so adjacent rows do not share one flat color', () => {
    const colors = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(artSlotColor));
    expect(colors.size).toBeGreaterThan(1);
  });

  it('handles invalid input without throwing', () => {
    expect(artSlotColor(NaN)).toMatch(/^hsl\(13 28% 26%\)$/);
  });
});
