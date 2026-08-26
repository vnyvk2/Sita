import type { CSSProperties } from 'react';

/**
 * Lets component style objects carry CSS custom properties (e.g. `--fx-*`) without fighting React's
 * CSSProperties typing. Values are passed through verbatim — no runtime cost.
 */
export const cssVars = (vars: Record<string, string | number>): CSSProperties =>
  vars as CSSProperties;
