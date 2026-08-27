import { memo } from 'react';

import { cssVars } from './cssVars';

export interface AuroraBackgroundProps {
  /**
   * Blob colors as HSL channel triplets (e.g. `'247 74% 63%'`), up to 3. Defaults to the theme's
   * accent ramp so every preset adapts for free.
   */
  colors?: string[];
  /**
   * Global intensity multiplier for blob alpha (0 - 1).
   *
   * @default 0.5
   */
  intensity?: number;
  /**
   * Animate the drifts. When false the blobs remain a static color wash (also forced under reduced
   * motion / fx master pause via CSS).
   *
   * @default true
   */
  animated?: boolean;
  /** Sizing/positioning classes for the absolutely-positioned container. */
  className?: string;
}

interface BlobLayout {
  left: string;
  top: string;
  size: string;
  baseAlpha: number;
}

const BLOB_LAYOUT: BlobLayout[] = [
  { left: '-12%', top: '-18%', size: '62%', baseAlpha: 0.6 },
  { left: '52%', top: '-14%', size: '58%', baseAlpha: 0.5 },
  { left: '18%', top: '48%', size: '68%', baseAlpha: 0.38 }
];

const DEFAULT_COLORS = ['var(--fx-accent)', 'var(--fx-accent-alt)', 'var(--fx-accent-third)'];

/**
 * Slow aurora washes built from radial gradients — the gradient falloff IS the softness, so no
 * filter blur is ever paid for. Only long transform drifts animate; everything is compositor work.
 */
export const AuroraBackground = memo(function AuroraBackground({
  colors,
  intensity = 0.5,
  animated = true,
  className = ''
}: AuroraBackgroundProps) {
  const palette =
    colors && colors.length > 0 ? colors.slice(0, BLOB_LAYOUT.length) : DEFAULT_COLORS;

  return (
    <div
      aria-hidden="true"
      className={`fx-aurora ${animated ? 'fx-aurora--animate' : ''} ${className}`.trim()}
    >
      {BLOB_LAYOUT.map((blob, i) => {
        const channels = palette[i] ?? palette[palette.length - 1];
        const alpha = Math.min(1, Math.max(0, intensity)) * blob.baseAlpha;
        return (
          <div
            key={i}
            className="fx-aurora__blob"
            style={cssVars({
              '--fx-blob-color': `hsl(${channels} / ${alpha.toFixed(3)})`,
              '--fx-blob-size': blob.size,
              '--fx-blob-opacity': 1,
              left: blob.left,
              top: blob.top
            })}
          />
        );
      })}
    </div>
  );
});

export default AuroraBackground;
