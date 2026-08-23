import { type Display, screen } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isRectOnAnyDisplay, isValidPersistedPosition } from '../utils/windowPosition';

describe('Window Positioning & Coordinate Validation', () => {
  beforeEach(() => {
    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 }
      } as unknown as Display
    ]);
  });

  it('rejects Windows minimized teleport coordinates (-32000, -32000)', () => {
    expect(isValidPersistedPosition(-32000, -32000, 320, 240)).toBe(false);
    expect(isValidPersistedPosition(-32000, 100, 320, 240)).toBe(false);
    expect(isValidPersistedPosition(100, -32000, 320, 240)).toBe(false);
    expect(isValidPersistedPosition(-30000, -30000, 320, 240)).toBe(false);
  });

  it('rejects null, undefined, or non-finite coordinates', () => {
    expect(isValidPersistedPosition(null, null)).toBe(false);
    expect(isValidPersistedPosition(undefined, 100)).toBe(false);
    expect(isValidPersistedPosition(100, undefined)).toBe(false);
    expect(isValidPersistedPosition(NaN, 100)).toBe(false);
    expect(isValidPersistedPosition(100, Infinity)).toBe(false);
    expect(isValidPersistedPosition(-Infinity, 100)).toBe(false);
  });

  it('accepts partially off-screen window positions with legitimate overhangs', () => {
    // Window top-left is at x = -10, but with width 320, it extends into screen [0, 310]
    expect(isValidPersistedPosition(-10, 100, 320, 240)).toBe(true);
    // Window top-left is at y = -10, but height 240 extends into screen [0, 230]
    expect(isValidPersistedPosition(100, -10, 320, 240)).toBe(true);
    // Window extends past the right edge: x = 1800, width = 320 on a 1920px screen
    expect(isValidPersistedPosition(1800, 100, 320, 240)).toBe(true);
    // Window extends past the bottom edge: y = 1000, height = 240 on a 1080px screen
    expect(isValidPersistedPosition(100, 1000, 320, 240)).toBe(true);
  });

  it('rejects coordinates completely outside all connected displays', () => {
    // Completely to the left of the display
    expect(isValidPersistedPosition(-400, 100, 320, 240)).toBe(false);
    // Completely to the right of the display
    expect(isValidPersistedPosition(2500, 100, 320, 240)).toBe(false);
    // Completely above the display
    expect(isValidPersistedPosition(100, -500, 320, 240)).toBe(false);
    // Completely below the display
    expect(isValidPersistedPosition(100, 2000, 320, 240)).toBe(false);
  });

  it('supports multi-monitor setups with negative display coordinates', () => {
    vi.spyOn(screen, 'getAllDisplays').mockReturnValue([
      {
        id: 1,
        bounds: { x: 0, y: 0, width: 1920, height: 1080 },
        workArea: { x: 0, y: 0, width: 1920, height: 1040 }
      } as unknown as Display,
      {
        id: 2,
        bounds: { x: -1920, y: 0, width: 1920, height: 1080 },
        workArea: { x: -1920, y: 0, width: 1920, height: 1040 }
      } as unknown as Display
    ]);

    // Position fully on secondary left monitor
    expect(isValidPersistedPosition(-1000, 200, 320, 240)).toBe(true);
    // Overhang between primary and secondary monitor
    expect(isValidPersistedPosition(-100, 200, 320, 240)).toBe(true);
    // Position outside both monitors
    expect(isValidPersistedPosition(-2500, 200, 320, 240)).toBe(false);
  });

  it('validates isRectOnAnyDisplay directly', () => {
    expect(isRectOnAnyDisplay({ x: 50, y: 50, width: 200, height: 100 })).toBe(true);
    expect(isRectOnAnyDisplay({ x: 3000, y: 3000, width: 200, height: 100 })).toBe(false);
  });
});
