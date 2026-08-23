import React, { memo } from 'react';
import type { TopGenreItem } from '../../queries/analytics';

interface TopGenresCardProps {
  topGenres: TopGenreItem[];
}

const GENRE_COLORS = [
  'bg-pink-500',
  'bg-indigo-500',
  'bg-emerald-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-rose-500',
  'bg-purple-500',
  'bg-teal-500'
];

export const TopGenresCard = memo(({ topGenres }: TopGenresCardProps) => {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-background-color-2/70 bg-background-color-1/80 p-5 shadow-sm backdrop-blur-md dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 transition-all hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-pink-500/10 text-pink-500">
              <span className="material-icons-round text-lg">category</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Top Genres
            </span>
          </div>
          <span className="text-xs font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">
            {topGenres.length} genres
          </span>
        </div>

        {topGenres.length === 0 ? (
          <div className="py-12 text-center text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
            No genre data recorded yet.
          </div>
        ) : (
          <div>
            {/* Segmented Percentage Distribution Bar */}
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-background-color-2/50 dark:bg-dark-background-color-2/50 mb-4">
              {topGenres.map((genre, idx) => {
                const colorClass = GENRE_COLORS[idx % GENRE_COLORS.length];
                return (
                  <div
                    key={genre.genreId}
                    title={`${genre.name}: ${genre.percentage}% (${genre.playCount} plays)`}
                    style={{ width: `${Math.max(2, genre.percentage)}%` }}
                    className={`${colorClass} h-full transition-all`}
                  />
                );
              })}
            </div>

            {/* List of Genres */}
            <div className="flex flex-col gap-2">
              {topGenres.map((genre, idx) => {
                const colorClass = GENRE_COLORS[idx % GENRE_COLORS.length];
                return (
                  <div
                    key={genre.genreId}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2.5 w-2.5 rounded-full ${colorClass} shrink-0`} />
                      <span className="truncate font-medium text-font-color-black dark:text-font-color-white">
                        {genre.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 text-right">
                      <span className="text-[11px] text-font-color-dimmed dark:text-dark-font-color-dimmed">
                        {genre.playCount} plays
                      </span>
                      <span className="w-10 text-[11px] font-semibold text-font-color-black dark:text-font-color-white">
                        {genre.percentage}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

TopGenresCard.displayName = 'TopGenresCard';
