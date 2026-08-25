import { memo, useCallback, useEffect, useRef } from 'react';
import type { CSSProperties, HTMLAttributes, PointerEvent } from 'react';

import { cssVars } from './cssVars';

export interface SpotlightCardProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Enables the pointer-following spotlight. Listeners are attached ONLY when this is true; writes
   * happen ONLY while hovered (rAF-throttled, no React state per frame). When false the card stays
   * 100% static and merely shows a fixed top-edge glow via CSS on hover/focus.
   *
   * @default false
   */
  interactive?: boolean;
  /**
   * Spotlight diameter in px.
   *
   * @default 320
   */
  size?: number;
  /**
   * Peak glow opacity (0 - 1).
   *
   * @default 0.14
   */
  intensity?: number;
  /**
   * Spotlight color as an HSL channel triplet (e.g. `'247 74% 63%'`). Defaults to the theme accent
   * (`--fx-accent`).
   */
  color?: string;
}

/**
 * Card wrapper with a radial spotlight sheen. The default path is pure CSS — zero listeners, zero
 * JS while idle. Pass `interactive` to make the glow track the pointer; coordinates are written
 * straight to CSS custom properties through a rAF throttle, so React never re-renders per frame.
 */
export const SpotlightCard = memo(function SpotlightCard({
  interactive = false,
  size,
  intensity,
  color,
  className = '',
  style,
  onPointerMove,
  onPointerLeave,
  children,
  ...rest
}: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef(0);
  const posRef = useRef({ x: 0, y: 0 });

  const flush = useCallback(() => {
    frameRef.current = 0;
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--fx-spotlight-x', `${posRef.current.x}px`);
    el.style.setProperty('--fx-spotlight-y', `${posRef.current.y}px`);
  }, []);

  useEffect(
    () => () => {
      if (frameRef.current && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameRef.current);
      }
    },
    []
  );

  const schedule = useCallback(() => {
    if (frameRef.current) return;
    if (typeof requestAnimationFrame === 'function') {
      frameRef.current = requestAnimationFrame(flush);
    } else {
      // Non-visual environments (tests, SSR): write synchronously.
      flush();
    }
  }, [flush]);

  const handleMove = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        posRef.current.x = e.clientX - rect.left;
        posRef.current.y = e.clientY - rect.top;
        schedule();
      }
      onPointerMove?.(e);
    },
    [onPointerMove, schedule]
  );

  const handleLeave = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (frameRef.current && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = 0;
      }
      // Reset so the next hover starts from the CSS default position.
      ref.current?.style.setProperty('--fx-spotlight-x', '50%');
      ref.current?.style.setProperty('--fx-spotlight-y', '0%');
      onPointerLeave?.(e);
    },
    [onPointerLeave]
  );

  const vars: Record<string, string | number> = {};
  if (size !== undefined) vars['--fx-spotlight-size'] = `${size}px`;
  if (intensity !== undefined) vars['--fx-spotlight-intensity'] = intensity;
  if (color !== undefined) vars['--fx-spotlight-color'] = color;

  return (
    <div
      {...rest}
      ref={ref}
      className={`fx-spotlight ${className}`.trim()}
      style={{ ...cssVars(vars), ...style } as CSSProperties}
      onPointerMove={interactive ? handleMove : onPointerMove}
      onPointerLeave={interactive ? handleLeave : onPointerLeave}
    >
      {children}
    </div>
  );
});

export default SpotlightCard;
