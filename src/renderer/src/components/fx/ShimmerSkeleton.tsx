import { memo } from 'react';
import type { HTMLAttributes } from 'react';

export interface ShimmerSkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Shape preset. - `'text'`: rounded line (default height 0.85em, width 100%) - `'circular'`:
   * perfect circle / pill - `'rectangular'`: softly rounded block
   *
   * @default 'text'
   */
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  /**
   * Disable the shimmer sweep and render a quiet static plate.
   *
   * @default true
   */
  animated?: boolean;
}

const VARIANT_CLASS: Record<'text' | 'circular' | 'rectangular', string> = {
  text: '',
  circular: 'rounded-full!',
  rectangular: ''
};

const RADIUS_VAR: Record<'text' | 'circular' | 'rectangular', string> = {
  text: '0.4rem',
  circular: '9999px',
  rectangular: '0.75rem'
};

/**
 * Zero-dependency skeleton placeholder with a compositor-only shimmer sweep (`transform` on a
 * pseudo-element — never layout, never repaint of content). Honors reduced motion and the fx master
 * pause.
 */
export const ShimmerSkeleton = memo(function ShimmerSkeleton({
  variant = 'text',
  width,
  height,
  animated = true,
  className = '',
  style,
  ...rest
}: ShimmerSkeletonProps) {
  const dimensions: HTMLAttributes<HTMLDivElement>['style'] = {};
  if (width !== undefined) dimensions.width = width;
  if (height !== undefined) {
    dimensions.height = height;
  } else if (variant === 'text') {
    dimensions.height = '0.85em';
  }
  if (!dimensions.width && variant !== 'text') {
    // circles/blocks default to a square based on their height when only one
    // dimension is provided
    if (height !== undefined) dimensions.width = height;
  }

  return (
    <div
      aria-hidden="true"
      {...rest}
      className={`fx-skeleton ${animated ? '' : 'fx-skeleton--static'} ${
        VARIANT_CLASS[variant]
      } ${className}`.trim()}
      style={{
        ...dimensions,
        ['--fx-skeleton-radius' as string]: RADIUS_VAR[variant],
        ...style
      }}
    />
  );
});

export default ShimmerSkeleton;
