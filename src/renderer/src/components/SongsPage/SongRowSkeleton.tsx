import { type CSSProperties, forwardRef, memo } from 'react';

interface SongRowSkeletonProps {
  index: number;
  height?: number;
  style?: CSSProperties;
  className?: string;
}

/**
 * Layout-stable placeholder for a not-yet-hydrated Song row.
 *
 * Mirrors the Song row's 60px grid (artwork square + title/artist/album/duration
 * columns) so swapping in the real row causes zero layout shift; content fades
 * in on the real row via its existing appear animation.
 */
const SongRowSkeleton = forwardRef<HTMLDivElement, SongRowSkeletonProps>(
  ({ index, height: _height, style, className = '' }, ref) => {
    const isOdd = typeof index === 'number' && (index + 1) % 2 === 1;

    return (
      <div
        ref={ref}
        data-skeleton-index={index}
        style={style}
        className={`song-item list-row [contain:layout] relative mr-4 mb-2 flex h-13 w-[98%] rounded-lg p-[0.2rem] px-2 -outline-offset-2 select-none items-center overflow-hidden ${
          isOdd
            ? 'bg-background-color-2/70! dark:bg-dark-background-color-2/50!'
            : 'bg-background-color-1! dark:bg-dark-background-color-1!'
        } ${className}`}
        aria-hidden="true"
      >
        <div className="flex h-full w-full items-center gap-2 animate-pulse">
          <div className="ml-1 w-[0.625rem] shrink-0">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! aspect-square rounded-sm opacity-60" />
          </div>
          <div className="relative aspect-square h-[85%] shrink-0 overflow-hidden rounded-md">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-full w-full opacity-60" />
          </div>
          <div className="grid min-w-0 flex-1 grid-cols-[45%_1fr_minmax(4.5rem,6rem)] items-center gap-2 sm:grid-cols-[35%_2fr_1fr_minmax(4rem,5rem)_minmax(4.5rem,6.5rem)] sm:gap-3 lg:grid-cols-[40%_1fr_minmax(4rem,5rem)_minmax(4.5rem,6.5rem)] lg:gap-0!">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-3.5 w-[80%] rounded-full opacity-60" />
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! hidden h-3 w-[70%] rounded-full opacity-50 md:block" />
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! hidden h-3 w-[55%] rounded-full opacity-40 md:block" />
          </div>
        </div>
      </div>
    );
  }
);

SongRowSkeleton.displayName = 'SongRowSkeleton';

export default memo(SongRowSkeleton);
