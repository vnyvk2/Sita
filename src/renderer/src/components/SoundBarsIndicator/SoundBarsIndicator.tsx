import { memo } from 'react';

import './SoundBarsIndicator.css';

export type SoundBarsVariant = 'dots' | 'bars';
export type SoundBarsSize = 'xs' | 'sm' | 'md' | 'lg' | number;

export interface SoundBarsIndicatorProps {
  /**
   * Whether the track is actively playing. - `true`: Animated variable equalizer activity. -
   * `false`: Deterministic paused idle state (stable bottom row).
   *
   * @default true
   */
  isPlaying?: boolean;
  /**
   * Visual aesthetic variant. - `'dots'`: Nora signature dot-matrix segmented visualizer (sv-matrix
   * style). - `'bars'`: Classic smooth vertical sound bars.
   *
   * @default 'dots'
   */
  variant?: SoundBarsVariant;
  /**
   * Preset size or custom pixel size. - `'xs'`: 14px - `'sm'`: 16px (default) - `'md'`: 20px -
   * `'lg'`: 24px
   *
   * @default 'sm'
   */
  size?: SoundBarsSize;
  /**
   * SVG fill color. Defaults to 'currentColor' to adapt seamlessly to themes.
   *
   * @default 'currentColor'
   */
  color?: string;
  /** Optional custom className for positioning or container styling. */
  className?: string;
}

const SIZE_MAP: Record<'xs' | 'sm' | 'md' | 'lg', number> = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24
};

const DOT_COLUMNS = [0.5, 4.5, 8.5, 12.5];
// Rows from top (y=1) to bottom baseline (y=12.4)
const DOT_ROWS = [
  { y: 1.0, rowNum: 4 },
  { y: 4.8, rowNum: 3 },
  { y: 8.6, rowNum: 2 },
  { y: 12.4, rowNum: 1 }
];
const DOT_WIDTH = 3;
const DOT_HEIGHT = 2.4;
const DOT_RADIUS = 0.6;

const BAR_COLUMNS = [1, 5, 9, 13];
const BAR_WIDTH = 2.5;
const BAR_HEIGHT = 14;
const BAR_RADIUS = 1.25;

/**
 * Renders a 4x4 matrix of discrete LED dots. - Bottom row (Row 1) acts as a stable illuminated
 * baseline. - Upper rows (Rows 2-4) illuminate dynamically via opacity keyframes.
 */
const DotsRenderer = memo(function DotsRenderer({ color }: { color: string }) {
  return (
    <>
      {/* Ghost matrix grid (faint background LED positions) */}
      <g className="sound-bars-ghost-grid" fill={color}>
        {DOT_COLUMNS.map((x, colIdx) => (
          <g key={`ghost-col-${colIdx}`}>
            {DOT_ROWS.map(({ y, rowNum }) => (
              <rect
                key={`ghost-${colIdx}-${rowNum}`}
                x={x}
                y={y}
                width={DOT_WIDTH}
                height={DOT_HEIGHT}
                rx={DOT_RADIUS}
                className="sound-bars-ghost-dot"
              />
            ))}
          </g>
        ))}
      </g>

      {/* Active illuminated dot cells */}
      <g className="sound-bars-active-matrix" fill={color}>
        {DOT_COLUMNS.map((x, colIdx) => {
          const colNum = colIdx + 1;
          return (
            <g
              key={`active-col-${colNum}`}
              className={`sound-bars-column sound-bars-col-${colNum}`}
            >
              {DOT_ROWS.map(({ y, rowNum }) => {
                const isBase = rowNum === 1;
                const dotClass = isBase
                  ? 'sound-bars-dot-base'
                  : `sound-bars-dot sound-bars-dot-r${rowNum} sound-bars-dot-c${colNum}-r${rowNum}`;

                return (
                  <rect
                    key={`active-${colNum}-r${rowNum}`}
                    x={x}
                    y={y}
                    width={DOT_WIDTH}
                    height={DOT_HEIGHT}
                    rx={DOT_RADIUS}
                    className={dotClass}
                  />
                );
              })}
            </g>
          );
        })}
      </g>
    </>
  );
});

/** Renders 4 smooth vertical sound bars. */
const BarsRenderer = memo(function BarsRenderer({ color }: { color: string }) {
  return (
    <g className="sound-bars-active-bars" fill={color}>
      {BAR_COLUMNS.map((x, colIdx) => (
        <g key={`bar-col-${colIdx}`} className={`sound-bars-col sound-bars-col-${colIdx + 1}`}>
          <rect x={x} y={1} width={BAR_WIDTH} height={BAR_HEIGHT} rx={BAR_RADIUS} />
        </g>
      ))}
    </g>
  );
});

export const SoundBarsIndicator = memo(function SoundBarsIndicator({
  isPlaying = true,
  variant = 'dots',
  size = 'sm',
  color = 'currentColor',
  className = ''
}: SoundBarsIndicatorProps) {
  const pixelSize = typeof size === 'number' ? size : (SIZE_MAP[size] ?? SIZE_MAP.sm);
  const stateClass = isPlaying ? 'sound-bars--playing' : 'sound-bars--paused';

  return (
    <span
      className={`sound-bars-indicator ${stateClass} ${className}`.trim()}
      style={{ width: pixelSize, height: pixelSize }}
      aria-hidden="true"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 16 16"
        width={pixelSize}
        height={pixelSize}
        className="sound-bars-svg"
      >
        {variant === 'dots' ? <DotsRenderer color={color} /> : <BarsRenderer color={color} />}
      </svg>
    </span>
  );
});

export default SoundBarsIndicator;
