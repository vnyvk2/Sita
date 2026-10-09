import { memo, useEffect, useMemo, useRef, useState } from 'react';

import type { ChronotypeData, HourlyDistributionItem } from '../../queries/analytics';
import { InsightCardWrapper } from './InsightCardWrapper';

interface CircadianRadarCardProps {
  hourlyDistribution: HourlyDistributionItem[];
  chronotype?: ChronotypeData;
}

function formatHour(hour: number): string {
  if (hour === 0) return '12 AM';
  if (hour === 12) return '12 PM';
  return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
}

export const CircadianRadarCard = memo(
  ({ hourlyDistribution, chronotype }: CircadianRadarCardProps) => {
    const [viewMode, setViewMode] = useState<'radar' | 'bars'>('radar');
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const maxHourPlays = useMemo(() => {
      if (hourlyDistribution.length === 0) return 1;
      return Math.max(...hourlyDistribution.map((h) => h.playCount), 1);
    }, [hourlyDistribution]);

    const peakHour = chronotype?.peakHour ?? 0;
    const chronotypeName = chronotype?.name ?? 'Night Owl';
    const chronotypeIcon = chronotype?.icon ?? 'bedtime';

    const segments = useMemo(() => {
      if (chronotype?.segmentPercentages) {
        return chronotype.segmentPercentages;
      }
      let night = 0;
      let morning = 0;
      let afternoon = 0;
      let evening = 0;

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
    }, [hourlyDistribution, chronotype]);

    // Canvas drawing for 24-Hour Polar Radar
    useEffect(() => {
      if (viewMode !== 'radar') return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = 80;

      ctx.clearRect(0, 0, w, h);

      // Draw concentric rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      [0.35, 0.65, 1].forEach((scale) => {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * scale, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Draw 24-Hour Radial Bars
      for (let i = 0; i < 24; i++) {
        const item = hourlyDistribution.find((hd) => hd.hour === i);
        const playCount = item?.playCount ?? 0;
        const angle = (i / 24) * Math.PI * 2 - Math.PI / 2;
        const barLen = 28 + (playCount / maxHourPlays) * (radius - 28);

        const x1 = cx + Math.cos(angle) * 30;
        const y1 = cy + Math.sin(angle) * 30;
        const x2 = cx + Math.cos(angle) * barLen;
        const y2 = cy + Math.sin(angle) * barLen;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineWidth = 3.5;

        // Color coding by day segment
        if (i < 6) {
          ctx.strokeStyle = i === peakHour ? '#06b6d4' : 'rgba(6, 182, 212, 0.65)';
        } else if (i < 12) {
          ctx.strokeStyle = i === peakHour ? '#f59e0b' : 'rgba(245, 158, 11, 0.55)';
        } else if (i < 18) {
          ctx.strokeStyle = i === peakHour ? '#3b82f6' : 'rgba(59, 130, 246, 0.55)';
        } else {
          ctx.strokeStyle = i === peakHour ? '#a855f7' : 'rgba(168, 85, 247, 0.55)';
        }
        ctx.stroke();
      }

      // Draw peak indicator pin
      const peakAngle = (peakHour / 24) * Math.PI * 2 - Math.PI / 2;
      const pinX = cx + Math.cos(peakAngle) * radius;
      const pinY = cy + Math.sin(peakAngle) * radius;

      ctx.beginPath();
      ctx.arc(pinX, pinY, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }, [viewMode, hourlyDistribution, maxHourPlays, peakHour]);

    return (
      <InsightCardWrapper
        glowColor="cyan"
        className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 flex flex-col justify-between p-5 shadow-sm backdrop-blur-md transition-all hover:border-cyan-500/40"
      >
        <div>
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-500">
                <span className="material-icons-round text-lg">{chronotypeIcon}</span>
              </span>
              <div>
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                  Circadian 2.0: Polar Radar
                </span>
                <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                  Peak: {formatHour(peakHour)} (Local Time)
                </p>
              </div>
            </div>

            {/* Toggle View Mode */}
            <div className="border-background-color-2/70 bg-background-color-2/40 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-2/40 flex items-center rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('radar')}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                  viewMode === 'radar'
                    ? 'bg-cyan-500 text-black shadow-sm'
                    : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'
                }`}
              >
                Radar
              </button>
              <button
                type="button"
                onClick={() => setViewMode('bars')}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-all ${
                  viewMode === 'bars'
                    ? 'bg-cyan-500 text-black shadow-sm'
                    : 'text-font-color-dimmed dark:text-dark-font-color-dimmed'
                }`}
              >
                Bars
              </button>
            </div>
          </div>

          {/* Visualization Area */}
          {viewMode === 'radar' ? (
            <div className="relative flex items-center justify-center py-2">
              <canvas
                ref={canvasRef}
                width={200}
                height={200}
                className="drop-shadow-[0_0_12px_rgba(6,182,212,0.25)]"
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="material-icons-round text-xl text-cyan-500">{chronotypeIcon}</span>
                <span className="text-font-color-black dark:text-font-color-white mt-0.5 text-xs font-bold">
                  {chronotypeName}
                </span>
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed font-mono text-[10px]">
                  Local Clock
                </span>
              </div>
            </div>
          ) : (
            <div className="pt-2 pb-2">
              <div className="flex h-24 w-full items-end gap-1">
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
          )}

          {/* 4 Segment Percentages */}
          <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs">
            <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-1.5 dark:bg-indigo-950/20">
              <span className="block text-[10px] font-bold text-indigo-500">NIGHT</span>
              <span className="text-font-color-black dark:text-font-color-white font-mono text-xs">
                {segments.night}%
              </span>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-1.5 dark:bg-amber-950/20">
              <span className="block text-[10px] font-bold text-amber-500">MORN</span>
              <span className="text-font-color-black dark:text-font-color-white font-mono text-xs">
                {segments.morning}%
              </span>
            </div>
            <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-1.5 dark:bg-blue-950/20">
              <span className="block text-[10px] font-bold text-blue-500">AFTN</span>
              <span className="text-font-color-black dark:text-font-color-white font-mono text-xs">
                {segments.afternoon}%
              </span>
            </div>
            <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-1.5 dark:bg-purple-950/20">
              <span className="block text-[10px] font-bold text-purple-500">EVE</span>
              <span className="text-font-color-black dark:text-font-color-white font-mono text-xs">
                {segments.evening}%
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-background-color-2/60 dark:border-dark-background-color-2/60 text-font-color-dimmed dark:text-dark-font-color-dimmed mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
          <span>
            Chronotype: <strong className="font-semibold text-cyan-500">{chronotypeName}</strong>
          </span>
          <span className="font-medium text-cyan-600 dark:text-cyan-400">
            Peak: {formatHour(peakHour)}
          </span>
        </div>
      </InsightCardWrapper>
    );
  }
);

CircadianRadarCard.displayName = 'CircadianRadarCard';
