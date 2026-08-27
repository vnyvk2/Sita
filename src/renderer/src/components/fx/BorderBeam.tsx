import { memo } from 'react';
import type { HTMLAttributes } from 'react';

import { cssVars } from './cssVars';

export interface BorderBeamProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Animate the beam around the border. When false — or when `@property` (Houdini) is unavailable —
   * the border renders as an elegant STATIC gradient ring instead of depending on animation
   * support.
   *
   * @default true
   */
  animated?: boolean;
  /**
   * Beam thickness in px.
   *
   * @default 1.5
   */
  thickness?: number;
  /**
   * Full sweep duration in seconds.
   *
   * @default 6
   */
  duration?: number;
  /**
   * Travel counter-clockwise.
   *
   * @default false
   */
  reverse?: boolean;
  /**
   * Head color as HSL channel triplet (e.g. `'247 74% 63%'`). Defaults to the theme accent
   * (`--fx-accent`).
   */
  colorFrom?: string;
  /** Tail color as HSL channel triplet. Defaults to `--fx-accent-alt`. */
  colorTo?: string;
}

/**
 * Wraps children with a conic-gradient light beam traveling along the border. The ring itself is
 * masked (no extra DOM, no box-shadow repaint); the only animated thing is a registered custom
 * property consumed by the gradient. Static fallback keeps the design intact everywhere else.
 */
export const BorderBeam = memo(function BorderBeam({
  animated = true,
  thickness = 1.5,
  duration = 6,
  reverse = false,
  colorFrom,
  colorTo,
  className = '',
  style,
  children,
  ...rest
}: BorderBeamProps) {
  const vars: Record<string, string | number> = {};
  vars['--fx-beam-width'] = `${thickness}px`;
  if (animated) vars['--fx-beam-duration'] = `${duration}s`;
  if (colorFrom !== undefined) vars['--fx-beam-from'] = colorFrom;
  if (colorTo !== undefined) vars['--fx-beam-to'] = colorTo;

  return (
    <div
      {...rest}
      className={`fx-beam ${animated ? 'fx-beam--animate' : ''} ${
        reverse ? 'fx-beam--reverse' : ''
      } ${className}`.trim()}
      style={{ ...cssVars(vars), ...style }}
    >
      {children}
    </div>
  );
});

export default BorderBeam;
