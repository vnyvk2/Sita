import { memo, useMemo } from 'react';

import type { HourlyDistributionItem } from '../../queries/analytics';

interface CircadianRhythmCardProps {
  hourlyDistribution: HourlyDistributionItem[];
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

export const CircadianRhythmCard = memo(({ hourlyDistribution }: CircadianRhythmCardProps) => {
  const maxHourPlays = useMemo(() => {
    if (hourlyDistribution.length === 0) return 1;
    return Math.max(...hourlyDistribution.map((h) => h.playCount), 1);
  }, [hourlyDistribution]);

  const peakHour = useMemo(() => {
    if (hourlyDistribution.length === 0) return 0;
    let max = -1;
    let peak = 0;
    for (const h of hourlyDistribution) {
      if (h.playCount > max) {
        max = h.playCount;
        peak = h.hour;
      }
    }
    return peak;
  }, [hourlyDistribution]);

  // Segment totals
  const segments = useMemo(() => {
    let night = 0; // 0..5
    let morning = 0; // 6..11
    let afternoon = 0; // 12..17
    let evening = 0; // 18..23

    for (const h of hourlyDistribution) {
      if (h.hour < 6) night += h.playCount;
      else if (h.hour < 12) morning += h.playCount;
      else if (h.hour < 18) afternoon += h.playCount;
      else evening += h.playCount;
    }

    const total = night + morning + afternoon + evening || 1;
    return {
      night: Math.round((night / total) * 100),
      morning: Math.round((morning / total) * 100),
      afternoon: Math.round((afternoon / total) * 100),
      evening: Math.round((evening / total) * 100)
    };
  }, [hourlyDistribution]);

  return (
    <div className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-all">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <span className="material-icons-round text-lg">bedtime</span>
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
              Circadian Rhythm
            </span>
          </div>
          <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
            Peak: {formatHour(peakHour)}
          </span>
        </div>

        {/* 24-Hour Vertical Bar Histogram */}
        <div className="pt-2 pb-2">
          <div className="flex h-20 w-full items-end gap-1">
            {hourlyDistribution.map((h) => {
              const heightPercent = Math.max(8, Math.round((h.playCount / maxHourPlays) * 100));
              const isPeak = h.hour === peakHour && h.playCount > 0;

              return (
                <div
                  key={h.hour}
                  title={`${formatHour(h.hour)}: ${h.playCount} plays (${h.percentage}%)`}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                >
                  <div
                    style={{ height: `${heightPercent}%` }}
                    className={`w-full rounded-t-sm transition-all duration-300 ${
                      isPeak
                        ? 'bg-cyan-500 shadow-sm shadow-cyan-500/50'
                        : 'bg-cyan-500/30 group-hover:bg-cyan-500/70'
                    }`}
                  />
                </div>
              );
            })}
          </div>
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 flex justify-between px-0.5 text-[10px]">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
        </div>

        {/* Daypart Distribution Pills */}
        <div className="border-background-color-2/40 mt-3 grid grid-cols-4 gap-1.5 border-t pt-2 text-center">
          <div className="bg-background-color-2/20 dark:bg-dark-background-color-2/20 rounded-lg p-1.5">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
              Night
            </div>
            <div className="text-font-color-black dark:text-font-color-white text-xs font-bold">
              {segments.night}%
            </div>
          </div>
          <div className="bg-background-color-2/20 dark:bg-dark-background-color-2/20 rounded-lg p-1.5">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
              Morning
            </div>
            <div className="text-font-color-black dark:text-font-color-white text-xs font-bold">
              {segments.morning}%
            </div>
          </div>
          <div className="bg-background-color-2/20 dark:bg-dark-background-color-2/20 rounded-lg p-1.5">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
              Afternoon
            </div>
            <div className="text-font-color-black dark:text-font-color-white text-xs font-bold">
              {segments.afternoon}%
            </div>
          </div>
          <div className="bg-background-color-2/20 dark:bg-dark-background-color-2/20 rounded-lg p-1.5">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[10px]">
              Evening
            </div>
            <div className="text-font-color-black dark:text-font-color-white text-xs font-bold">
              {segments.evening}%
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

CircadianRhythmCard.displayName = 'CircadianRhythmCard';
