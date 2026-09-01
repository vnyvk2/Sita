import { MINI_PLAYER_MIN_SIZE_X, MINI_PLAYER_MIN_SIZE_Y } from '@common/miniPlayerConstants';
import { screen } from 'electron';

/** Checks whether a rectangle intersects any connected display. */
export function isRectOnAnyDisplay(bounds: {
  x: number;
  y: number;
  width: number;
  height: number;
}): boolean {
  return screen.getAllDisplays().some((display) => {
    const { x, y, width, height } = display.bounds;
    return (
      bounds.x < x + width &&
      bounds.x + bounds.width > x &&
      bounds.y < y + height &&
      bounds.y + bounds.height > y
    );
  });
}

/**
 * Validates a persisted window position. Guards against Windows' minimized-window coordinates
 * (-32000) and positions that do not intersect any connected display. Uses actual/minimum window
 * footprint rather than a 1x1 point to allow legitimate partial overhangs.
 */
export function isValidPersistedPosition(
  x: number | null | undefined,
  y: number | null | undefined,
  width: number = MINI_PLAYER_MIN_SIZE_X,
  height: number = MINI_PLAYER_MIN_SIZE_Y
): boolean {
  if (
    x === null ||
    x === undefined ||
    y === null ||
    y === undefined ||
    !Number.isFinite(x) ||
    !Number.isFinite(y)
  )
    return false;
  if (x <= -30000 || y <= -30000) return false;
  return isRectOnAnyDisplay({ x, y, width, height });
}
