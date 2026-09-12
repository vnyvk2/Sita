import { memo } from 'react';

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
    <div className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 hover:border-font-color-highlight/30 dark:hover:border-dark-font-color-highlight/30 flex flex-col justify-between rounded-2xl border p-5 shadow-sm backdrop-blur-md transition-all">
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500">
              <span className="material-icons-round text-lg">graphic_eq</span>
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
              Audiophile Vault
            </span>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            Hi-Res: {stats.hiResCount}
          </span>
        </div>

        {/* Quality Metrics Grid */}
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 rounded-xl border p-2.5">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-medium">
              Avg Bitrate
            </div>
            <div className="text-font-color-black dark:text-font-color-white text-base font-bold">
              {stats.averageBitrate}{' '}
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-normal">
                kbps
              </span>
            </div>
          </div>
          <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 rounded-xl border p-2.5">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px] font-medium">
              Total Duration
            </div>
            <div className="text-font-color-black dark:text-font-color-white text-base font-bold">
              {formatLibraryDuration(stats.totalDurationSeconds)}
            </div>
          </div>
        </div>

        {/* Lossless vs Lossy Gauge Bar */}
        <div className="mb-3">
          <div className="mb-1.5 flex justify-between text-xs font-medium">
            <span className="text-emerald-600 dark:text-emerald-400">
              Lossless ({losslessPercentage}%)
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
              Lossy ({lossyPercentage}%)
            </span>
          </div>
          <div className="bg-background-color-2/60 dark:bg-dark-background-color-2/60 flex h-2.5 w-full overflow-hidden rounded-full">
            <div
              style={{ width: `${losslessPercentage}%` }}
              className="bg-emerald-500 transition-all duration-500"
            />
            <div
              style={{ width: `${lossyPercentage}%` }}
              className="bg-slate-400 transition-all duration-500 dark:bg-slate-600"
            />
          </div>
        </div>

        {/* Codec Breakdown Pills */}
        <div>
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mb-1.5 text-[11px] font-medium">
            Codecs & Formats
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.codecBreakdown.slice(0, 6).map((codec) => (
              <span
                key={codec.codec}
                className="border-background-color-2/60 bg-background-color-2/30 text-font-color-black dark:border-dark-background-color-2/60 dark:bg-dark-background-color-2/30 dark:text-font-color-white inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-medium"
              >
                <span className="font-bold">{codec.codec}</span>
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed">
                  ({codec.count})
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

AudiophileVaultCard.displayName = 'AudiophileVaultCard';
