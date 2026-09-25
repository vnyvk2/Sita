import { type CSSProperties, forwardRef, memo } from 'react';

interface SongRowSkeletonProps {
  index: number;
  height?: number;
  style?: CSSProperties;
  className?: string;
  isCompact?: boolean;
}

/**
 * Layout-stable placeholder for a not-yet-hydrated Song row.
 *
 * Mirrors the Song row's 60px or 38px grid so swapping in the real row causes zero layout shift.
 */
const SongRowSkeleton = forwardRef<HTMLDivElement, SongRowSkeletonProps>(
  ({ index, height: _height, style, className = '', isCompact = false }, ref) => {
    const isOdd = typeof index === 'number' && (index + 1) % 2 === 1;

    if (isCompact) {
      return (
        <div
          ref={ref}
          data-skeleton-index={index}
          style={{ ...style, height: 38 }}
          className={`compact-song-skeleton relative flex h-[38px] w-full items-center select-none text-xs border-b border-background-color-2/30 dark:border-dark-background-color-2/30 px-2 animate-pulse ${
            isOdd
              ? 'bg-background-color-2/40! dark:bg-dark-background-color-2/30!'
              : 'bg-background-color-1! dark:bg-dark-background-color-1!'
          } ${className}`}
          aria-hidden="true"
        >
          <div className="w-[28px] shrink-0 flex items-center justify-center">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-3 w-3 rounded-sm opacity-50" />
          </div>
          <div className="flex-1 min-w-0 pl-3 pr-2">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-3 w-[70%] rounded-full opacity-60" />
          </div>
          <div className="w-[22%] min-w-0 pl-3 pr-2">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-2.5 w-[80%] rounded-full opacity-50" />
          </div>
          <div className="w-[20%] min-w-0 pl-3 pr-2 sm:hidden md:hidden lg:block">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-2.5 w-[65%] rounded-full opacity-40" />
          </div>
          <div className="min-w-[4rem] flex justify-end pr-3">
            <div className="bg-background-color-2! dark:bg-dark-background-color-2! h-2.5 w-8 rounded-full opacity-50" />
          </div>
          <div className="min-w-[4.5rem] shrink-0" />
        </div>
      );
    }

    return (
      <div
        ref={ref}
        data-skeleton-index={index}
        style={style}
        className={`song-item list-row relative mr-4 mb-2 flex h-13 w-[98%] items-center overflow-hidden rounded-lg p-[0.2rem] px-2 -outline-offset-2 [contain:layout] select-none ${
          isOdd
            ? 'bg-background-color-2/70! dark:bg-dark-background-color-2/50!'
            : 'bg-background-color-1! dark:bg-dark-background-color-1!'
        } ${className}`}
        aria-hidden="true"
      >
        <div className="flex h-full w-full animate-pulse items-center gap-2">
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
