import React, { memo, useMemo } from 'react';
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
    <div className="flex flex-col justify-between rounded-2xl border border-background-color-2/70 bg-background-color-1/80 p-5 shadow-sm backdrop-blur-md dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 transition-all hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <span className="material-icons-round text-lg">bedtime</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Circadian Rhythm
            </span>
          </div>
          <span className="text-[11px] font-medium text-cyan-600 dark:text-cyan-400">
            Peak: {formatHour(peakHour)}
          </span>
        </div>

        {/* 24-Hour Vertical Bar Histogram */}
        <div className="pt-2 pb-2">
          <div className="flex items-end gap-1 h-20 w-full">
            {hourlyDistribution.map((h) => {
              const heightPercent = Math.max(8, Math.round((h.playCount / maxHourPlays) * 100));
              const isPeak = h.hour === peakHour && h.playCount > 0;

              return (
                <div
                  key={h.hour}
                  title={`${formatHour(h.hour)}: ${h.playCount} plays (${h.percentage}%)`}
                  className="group relative flex-1 flex flex-col items-center h-full justify-end"
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
          <div className="flex justify-between text-[10px] text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 px-0.5">
            <span>12 AM</span>
            <span>6 AM</span>
            <span>12 PM</span>
            <span>6 PM</span>
            <span>11 PM</span>
          </div>
        </div>

        {/* Daypart Distribution Pills */}
        <div className="mt-3 pt-2 border-t border-background-color-2/40 grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-lg bg-background-color-2/20 p-1.5 dark:bg-dark-background-color-2/20">
            <div className="text-[10px] text-font-color-dimmed dark:text-dark-font-color-dimmed">Night</div>
            <div className="text-xs font-bold text-font-color-black dark:text-font-color-white">{segments.night}%</div>
          </div>
          <div className="rounded-lg bg-background-color-2/20 p-1.5 dark:bg-dark-background-color-2/20">
            <div className="text-[10px] text-font-color-dimmed dark:text-dark-font-color-dimmed">Morning</div>
            <div className="text-xs font-bold text-font-color-black dark:text-font-color-white">{segments.morning}%</div>
          </div>
          <div className="rounded-lg bg-background-color-2/20 p-1.5 dark:bg-dark-background-color-2/20">
            <div className="text-[10px] text-font-color-dimmed dark:text-dark-font-color-dimmed">Afternoon</div>
            <div className="text-xs font-bold text-font-color-black dark:text-font-color-white">{segments.afternoon}%</div>
          </div>
          <div className="rounded-lg bg-background-color-2/20 p-1.5 dark:bg-dark-background-color-2/20">
            <div className="text-[10px] text-font-color-dimmed dark:text-dark-font-color-dimmed">Evening</div>
            <div className="text-xs font-bold text-font-color-black dark:text-font-color-white">{segments.evening}%</div>
          </div>
        </div>
      </div>
    </div>
  );
});

CircadianRhythmCard.displayName = 'CircadianRhythmCard';
