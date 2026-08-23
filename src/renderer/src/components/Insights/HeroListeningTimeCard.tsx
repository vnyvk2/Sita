import React, { memo, useMemo } from 'react';
import type { DailyActivityItem, ListeningAnalyticsSummary } from '../../queries/analytics';

interface HeroListeningTimeCardProps {
  summary: ListeningAnalyticsSummary;
  dailyActivity: DailyActivityItem[];
}

function formatHoursAndMinutes(totalSeconds: number): { hours: number; minutes: number; display: string } {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return { hours, minutes, display: `${hours}h ${minutes}m` };
  }
  return { hours: 0, minutes, display: `${minutes}m` };
}

export const HeroListeningTimeCard = memo(({ summary, dailyActivity }: HeroListeningTimeCardProps) => {
  const timeFormatted = useMemo(() => formatHoursAndMinutes(summary.totalListeningSeconds), [summary.totalListeningSeconds]);

  const maxDailySeconds = useMemo(() => {
    if (dailyActivity.length === 0) return 1;
    return Math.max(...dailyActivity.map((d) => d.seconds), 1);
  }, [dailyActivity]);

  const completionPercentage = Math.round(summary.completionRate * 100);

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-background-color-2/70 bg-background-color-1/80 p-5 shadow-sm backdrop-blur-md dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 transition-all hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30">
      {/* Header & Main Metric */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-font-color-highlight/10 text-font-color-highlight dark:bg-dark-font-color-highlight/10 dark:text-dark-font-color-highlight">
              <span className="material-icons-round text-lg">schedule</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed">
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
            <span className="text-4xl font-bold tracking-tight text-font-color-black dark:text-font-color-white">
              {timeFormatted.display}
            </span>
            <span className="text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
              ({Math.round(summary.totalListeningSeconds / 60)} total minutes)
            </span>
          </div>
        </div>

        {/* Quick Stats Badges */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-background-color-2/40 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20">
            <div className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">Plays</div>
            <div className="text-base font-semibold text-font-color-black dark:text-font-color-white">
              {summary.totalPlaysCount.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-background-color-2/40 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20">
            <div className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">Unique Songs</div>
            <div className="text-base font-semibold text-font-color-black dark:text-font-color-white">
              {summary.uniqueSongsPlayed.toLocaleString()}
            </div>
          </div>
          <div className="rounded-xl border border-background-color-2/40 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20">
            <div className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">Completion</div>
            <div className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
              {completionPercentage}%
            </div>
          </div>
        </div>
      </div>

      {/* Daily Activity Sparkline Bars */}
      <div className="mt-4 pt-3 border-t border-background-color-2/40 dark:border-dark-background-color-2/40">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">Daily Velocity</span>
          <span className="text-[11px] text-font-color-dimmed dark:text-dark-font-color-dimmed">
            {dailyActivity.length} active days
          </span>
        </div>

        {dailyActivity.length === 0 ? (
          <div className="py-4 text-center text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed italic">
            No daily activity recorded for this period.
          </div>
        ) : (
          <div className="flex items-end gap-1.5 h-16 w-full pt-2">
            {dailyActivity.slice(-30).map((d) => {
              const heightPercent = Math.max(8, Math.round((d.seconds / maxDailySeconds) * 100));
              const mins = Math.round(d.seconds / 60);

              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${mins} mins (${d.playCount} plays)`}
                  className="group relative flex-1 flex flex-col items-center h-full justify-end"
                >
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className="w-full rounded-t-md bg-font-color-highlight/70 dark:bg-dark-font-color-highlight/70 transition-all duration-300 group-hover:bg-font-color-highlight dark:group-hover:bg-dark-font-color-highlight group-hover:brightness-110"
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
});

HeroListeningTimeCard.displayName = 'HeroListeningTimeCard';
