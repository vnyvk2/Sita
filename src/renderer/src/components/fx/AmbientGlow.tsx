import { memo } from 'react';

/**
 * Ambient backdrop built from a pre-blurred, slightly oversized copy of an image (album art). The
 * blur is a STATIC filter paint rasterized once per resize; the optional drift animates the
 * wrapper's transform only, so the blurred texture is never recomputed while animating. A gradient
 * veil fades the glow into the page background for text readability.
 *
 * Purely decorative: `aria-hidden`, no pointer events.
 */
export interface AmbientGlowProps {
  /** Image source. When absent only the readability veil renders. */
  src?: string | null;
  /**
   * Slow ken-burns style drift (reuses the app's existing `.animate-ambient-drift` keyframes).
   *
   * @default true
   */
  drift?: boolean;
  /**
   * Static blur radius in px applied to the artwork.
   *
   * @default 56
   */
  blur?: number;
  /**
   * Static brightness filter multiplier.
   *
   * @default 0.85
   */
  brightness?: number;
  /**
   * Static saturation filter multiplier.
   *
   * @default 1.3
   */
  saturation?: number;
  /**
   * Render the bottom fade-to-background veil.
   *
   * @default true
   */
  overlay?: boolean;
  /**
   * Sizing/positioning comes from the consumer: pass Tailwind classes such as `inset-0` / `-z-10`
   * via className. Defaults to filling its parent.
   */
  className?: string;
}

export const AmbientGlow = memo(function AmbientGlow({
  src,
  drift = true,
  blur = 56,
  brightness = 0.85,
  saturation = 1.3,
  overlay = true,
  className = ''
}: AmbientGlowProps) {
  return (
    <div aria-hidden="true" className={`fx-ambient ${className}`.trim()}>
      <div className={`fx-ambient__layer ${drift ? 'animate-ambient-drift' : ''}`}>
        {src ? (
          <img
            src={src}
            alt=""
            draggable={false}
            decoding="async"
            loading="eager"
            fetchPriority="low"
            className="fx-ambient__art"
            style={{ filter: `blur(${blur}px) saturate(${saturation}) brightness(${brightness})` }}
          />
        ) : null}
      </div>
      {overlay ? <div className="fx-ambient__overlay" /> : null}
    </div>
  );
});

export default AmbientGlow;
