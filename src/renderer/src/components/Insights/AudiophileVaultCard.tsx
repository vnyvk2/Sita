import React, { memo } from 'react';
import type { LibraryAudioStatsData } from '../../queries/analytics';

interface AudiophileVaultCardProps {
  stats: LibraryAudioStatsData;
}

function formatLibraryDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  return `${hours}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
}

export const AudiophileVaultCard = memo(({ stats }: AudiophileVaultCardProps) => {
  const losslessPercentage =
    stats.totalTracks > 0 ? Math.round((stats.losslessCount / stats.totalTracks) * 100) : 0;
  const lossyPercentage = 100 - losslessPercentage;

  return (
    <div className="flex flex-col justify-between rounded-2xl border border-background-color-2/70 bg-background-color-1/80 p-5 shadow-sm backdrop-blur-md dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 transition-all hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <span className="material-icons-round text-lg">graphic_eq</span>
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Audiophile Vault
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Hi-Res: {stats.hiResCount}
          </span>
        </div>

        {/* Quality Metrics Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="rounded-xl border border-background-color-2/40 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20">
            <div className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">Avg Bitrate</div>
            <div className="text-base font-bold text-font-color-black dark:text-font-color-white">
              {stats.averageBitrate} <span className="text-xs font-normal text-font-color-dimmed dark:text-dark-font-color-dimmed">kbps</span>
            </div>
          </div>
          <div className="rounded-xl border border-background-color-2/40 bg-background-color-2/20 p-2.5 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20">
            <div className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed">Total Duration</div>
            <div className="text-base font-bold text-font-color-black dark:text-font-color-white">
              {formatLibraryDuration(stats.totalDurationSeconds)}
            </div>
          </div>
        </div>

        {/* Lossless vs Lossy Gauge Bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1.5 font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">
              Lossless ({losslessPercentage}%)
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Lossy ({lossyPercentage}%)
            </span>
          </div>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-background-color-2/60 dark:bg-dark-background-color-2/60">
            <div
              style={{ width: `${losslessPercentage}%` }}
              className="bg-emerald-500 transition-all duration-500"
            />
            <div
              style={{ width: `${lossyPercentage}%` }}
              className="bg-slate-400 dark:bg-slate-600 transition-all duration-500"
            />
          </div>
        </div>

        {/* Codec Breakdown Pills */}
        <div>
          <div className="text-[11px] font-medium text-font-color-dimmed dark:text-dark-font-color-dimmed mb-1.5">
            Codecs & Formats
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.codecBreakdown.slice(0, 6).map((codec) => (
              <span
                key={codec.codec}
                className="inline-flex items-center gap-1 rounded-lg border border-background-color-2/60 bg-background-color-2/30 px-2 py-1 text-[11px] font-medium text-font-color-black dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/30 dark:text-font-color-white"
              >
                <span className="font-bold">{codec.codec}</span>
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">({codec.count})</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

AudiophileVaultCard.displayName = 'AudiophileVaultCard';
