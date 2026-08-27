import { memo } from 'react';

import { cssVars } from './cssVars';

export type DotLoaderVariant = 'orbit' | 'pulse' | 'wave';
export type DotLoaderSize = 'xs' | 'sm' | 'md' | 'lg' | number;

export interface DotLoaderProps {
  /**
   * Loader pattern. - `'orbit'`: a ring of dots carried by a single rotating element (cheapest) -
   * `'pulse'`: 3x3 grid breathing via scale/opacity - `'wave'`: vertical bars scaling from their
   * baseline
   *
   * @default 'orbit'
   */
  variant?: DotLoaderVariant;
  /**
   * Preset size or custom pixel size.
   *
   * @default 'sm'
   */
  size?: DotLoaderSize;
  /**
   * Speed multiplier. `1` plays at the default tempo; `2` is twice as fast, `0.5` half speed.
   * Values are clamped to a calm range (0.25 - 3).
   *
   * @default 1
   */
  speed?: number;
  /** Optional custom className for positioning or color (uses currentColor). */
  className?: string;
}

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg', number> = {
  xs: 16,
  sm: 22,
  md: 30,
  lg: 40
};

const ORBIT_DOT_COUNT = 8;
const PULSE_GRID = 3; // 3x3 => 9 dots
const WAVE_BAR_COUNT = 5;

const clampSpeed = (speed: number): number => Math.min(3, Math.max(0.25, speed || 1));

/**
 * Zero-dependency dot-matrix loading indicator (sv-matrix flavored). Compositor-only animations;
 * honors reduced motion and the fx master pause. Decorative by design: rendered `aria-hidden`.
 */
export const DotLoader = memo(function DotLoader({
  variant = 'orbit',
  size = 'sm',
  speed = 1,
  className = ''
}: DotLoaderProps) {
  const px = typeof size === 'number' ? size : (SIZE_MAP[size] ?? SIZE_MAP.sm);
  const rate = clampSpeed(speed);

  if (variant === 'orbit') {
    const dotPx = Math.max(2, Math.round(px * 0.16));
    const radius = Math.max(0, px / 2 - dotPx / 2 - 1);

    return (
      <span
        aria-hidden="true"
        className={`fx-dots ${className}`.trim()}
        style={{ width: px, height: px }}
      >
        <span
          className="fx-dots__orbit"
          style={cssVars({
            '--fx-dot-size': `${dotPx}px`,
            '--fx-orbit-duration': `${(1.2 / rate).toFixed(3)}s`
          })}
        >
          {Array.from({ length: ORBIT_DOT_COUNT }, (_, i) => (
            <span
              key={i}
              className="fx-dots__orbit-dot"
              style={{
                transform: `rotate(${(360 / ORBIT_DOT_COUNT) * i}deg) translateY(-${radius}px)`
              }}
            />
          ))}
        </span>
      </span>
    );
  }

  if (variant === 'pulse') {
    const dotPx = Math.max(2, Math.round(px * 0.18));
    const step = Math.round(dotPx + Math.max(2, px * 0.09));
    const offset = ((PULSE_GRID - 1) * step) / 2;

    return (
      <span
        aria-hidden="true"
        className={`fx-dots ${className}`.trim()}
        style={{ width: px, height: px }}
      >
        {Array.from({ length: PULSE_GRID * PULSE_GRID }, (_, i) => {
          const row = Math.floor(i / PULSE_GRID);
          const col = i % PULSE_GRID;
          return (
            <span
              key={i}
              className="fx-dots__pulse-dot"
              style={{
                width: dotPx,
                height: dotPx,
                left: `calc(50% + ${col * step - offset}px)`,
                top: `calc(50% + ${row * step - offset}px)`,
                marginLeft: -dotPx / 2,
                marginTop: -dotPx / 2,
                animationDelay: `${((i % PULSE_GRID) * 0.11 + row * 0.07) / rate}s`
              }}
            />
          );
        })}
      </span>
    );
  }

  // wave
  const barWidth = Math.max(2, Math.round(px * 0.12));

  return (
    <span
      aria-hidden="true"
      className={`fx-dots items-stretch! ${className}`.trim()}
      style={{ width: 'auto', height: px, gap: Math.max(2, Math.round(px * 0.14)) }}
    >
      {Array.from({ length: WAVE_BAR_COUNT }, (_, i) => (
        <span
          key={i}
          className="fx-dots__wave-bar"
          style={cssVars({
            '--fx-bar-width': `${barWidth}px`,
            '--fx-wave-duration': `${(0.72 / rate).toFixed(3)}s`,
            animationDelay: `${(i * 0.09) / rate}s`
          })}
        />
      ))}
    </span>
  );
});

export default DotLoader;
