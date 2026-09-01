import React, { memo, useMemo } from 'react';

import type { DailyActivityItem, ListeningAnalyticsSummary } from '../../queries/analytics';

interface HeroListeningTimeCardProps {
  summary: ListeningAnalyticsSummary;
  dailyActivity: DailyActivityItem[];
}

function formatHoursAndMinutes(totalSeconds: number): {
  hours: number;
  minutes: number;
  display: string;
} {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return { hours, minutes, display: `${hours}h ${minutes}m` };
  }
  return { hours: 0, minutes, display: `${minutes}m` };
}

export const HeroListeningTimeCard = memo(
  ({ summary, dailyActivity }: HeroListeningTimeCardProps) => {
    const timeFormatted = useMemo(
      () => formatHoursAndMinutes(summary.totalListeningSeconds),
      [summary.totalListeningSeconds]
    );

    const maxDailySeconds = useMemo(() => {
      if (dailyActivity.length === 0) return 1;
      return Math.max(...dailyActivity.map((d) => d.seconds), 1);
    }, [dailyActivity]);

    const completionPercentage = Math.round(summary.completionRate * 100);

    return (
      <div className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-all">
        {/* Header & Main Metric */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/10 dark:text-dark-font-color-highlight flex h-8 w-8 items-center justify-center rounded-xl">
                <span className="material-icons-round text-lg">schedule</span>
              </span>
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                Listening Time
              </span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="material-icons-round text-xs">trending_up</span>
              Active
            </span>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2">
              <span className="text-font-color-black dark:text-font-color-white text-4xl font-bold tracking-tight">
                {timeFormatted.display}
              </span>
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
                ({Math.round(summary.totalListeningSeconds / 60)} total minutes)
              </span>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 rounded-xl border p-2.5">
              <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-medium">
                Plays
              </div>
              <div className="text-font-color-black dark:text-font-color-white text-base font-semibold">
                {summary.totalPlaysCount.toLocaleString()}
              </div>
            </div>
            <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 rounded-xl border p-2.5">
              <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-medium">
                Unique Songs
              </div>
              <div className="text-font-color-black dark:text-font-color-white text-base font-semibold">
                {summary.uniqueSongsPlayed.toLocaleString()}
              </div>
            </div>
            <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 rounded-xl border p-2.5">
              <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-medium">
                Completion
              </div>
              <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                {completionPercentage}%
              </div>
            </div>
          </div>
        </div>

        {/* Daily Activity Sparkline Bars */}
        <div className="border-background-color-2/40 dark:border-dark-background-color-2/40 mt-4 border-t pt-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-medium">
              Daily Velocity
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
              {dailyActivity.length} active days
            </span>
          </div>

          {dailyActivity.length === 0 ? (
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed py-4 text-center text-xs italic">
              No daily activity recorded for this period.
            </div>
          ) : (
            <div className="flex h-16 w-full items-end gap-1.5 pt-2">
              {dailyActivity.slice(-30).map((d) => {
                const heightPercent = Math.max(8, Math.round((d.seconds / maxDailySeconds) * 100));
                const mins = Math.round(d.seconds / 60);

                return (
                  <div
                    key={d.date}
                    title={`${d.date}: ${mins} mins (${d.playCount} plays)`}
                    className="group relative flex h-full flex-1 flex-col items-center justify-end"
                  >
                    <div
                      style={{ height: `${heightPercent}%` }}
                      className="bg-font-color-highlight/70 dark:bg-dark-font-color-highlight/70 group-hover:bg-font-color-highlight dark:group-hover:bg-dark-font-color-highlight w-full rounded-t-md transition-all duration-300 group-hover:brightness-110"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);

HeroListeningTimeCard.displayName = 'HeroListeningTimeCard';
