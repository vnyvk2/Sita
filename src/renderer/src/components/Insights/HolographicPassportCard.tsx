import { memo, useCallback, useState } from 'react';

import type {
  AudiophileListeningMetrics,
  ChronotypeData,
  ListeningAnalyticsSummary
} from '../../queries/analytics';
import { InsightCardWrapper } from './InsightCardWrapper';

interface HolographicPassportCardProps {
  summary: ListeningAnalyticsSummary;
  chronotype?: ChronotypeData;
  metrics?: AudiophileListeningMetrics;
}

export const HolographicPassportCard = memo(
  ({ summary, chronotype, metrics }: HolographicPassportCardProps) => {
    const [copied, setCopied] = useState(false);

    const totalHours = (summary.totalListeningSeconds / 3600).toFixed(1);
    const purity = metrics?.losslessPercentage ?? 90;
    const peakHour = chronotype?.peakHour ?? 0;
    const chronotypeName = chronotype?.name ?? 'Vampiric Night Owl';
    const chronotypeIcon = chronotype?.icon ?? 'bedtime';

    const formatPeakHour = (h: number) => {
      if (h === 0) return '12 AM';
      if (h === 12) return '12 PM';
      return h > 12 ? `${h - 12} PM` : `${h} AM`;
    };

    const handleCopy = useCallback(() => {
      const summaryText = `🎵 Nora Music Passport:
• Archetype: ${chronotypeName}
• Total Listening: ${totalHours} hours
• Audio Purity: ${purity}% Lossless
• Peak Zone: ${formatPeakHour(peakHour)}
• Completion Rate: ${(summary.completionRate * 100).toFixed(0)}%`;

      navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }, [chronotypeName, totalHours, purity, peakHour, summary.completionRate]);

    return (
      <InsightCardWrapper
        glowColor="cyan"
        className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 flex flex-col justify-between p-5 shadow-sm backdrop-blur-md transition-all hover:border-cyan-500/40"
      >
        <div>
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 to-fuchsia-500 text-sm font-bold text-white shadow-sm">
                🎴
              </span>
              <div>
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                  Holographic Persona Card
                </span>
                <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                  Shareable Audio Passport
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className="border-background-color-2/70 bg-background-color-2/50 hover:bg-font-color-highlight dark:border-dark-background-color-2/70 dark:bg-dark-background-color-2/50 dark:hover:bg-dark-font-color-highlight dark:hover:text-dark-background-color-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-all hover:text-white"
            >
              {copied ? 'Copied!' : 'Share Story'}
            </button>
          </div>

          {/* Holographic ID Badge */}
          <div className="via-background-color-2/30 mt-2 rounded-xl border border-cyan-500/30 bg-gradient-to-tr from-cyan-950/20 to-fuchsia-950/20 p-4 shadow-inner dark:from-cyan-950/50 dark:to-fuchsia-950/50">
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed flex items-center justify-between font-mono text-[10px] tracking-wider uppercase">
              <span className="font-bold text-cyan-600 dark:text-cyan-400">NORA PASSPORT</span>
              <span>VERIFIED // 2026</span>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-tr from-cyan-500 via-purple-500 to-rose-500 p-0.5 shadow-md">
                <div className="bg-background-color-1 dark:bg-dark-background-color-1 flex h-full w-full items-center justify-center rounded-[10px]">
                  <span className="material-icons-round text-2xl text-cyan-500">
                    {chronotypeIcon}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-font-color-black dark:text-font-color-white text-sm font-bold">
                  {chronotypeName}
                </h4>
                <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                  {metrics?.dominantResolution ?? 'Hi-Fi Audio Enthusiast'}
                </p>
              </div>
            </div>

            {/* 3 Metric Pills */}
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-700/30 pt-3 text-center font-mono">
              <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 rounded-lg p-1.5">
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed block text-[9px]">
                  HOURS
                </span>
                <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
                  {totalHours}h
                </span>
              </div>
              <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 rounded-lg p-1.5">
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed block text-[9px]">
                  PURITY
                </span>
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
                  {purity}%
                </span>
              </div>
              <div className="bg-background-color-2/40 dark:bg-dark-background-color-2/40 rounded-lg p-1.5">
                <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed block text-[9px]">
                  PEAK
                </span>
                <span className="text-xs font-bold text-fuchsia-600 dark:text-fuchsia-400">
                  {formatPeakHour(peakHour)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Info */}
        <div className="border-background-color-2/60 dark:border-dark-background-color-2/60 text-font-color-dimmed dark:text-dark-font-color-dimmed mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
          <span>
            Status: <strong className="font-semibold text-emerald-500">Active</strong>
          </span>
          <span className="font-medium text-cyan-600 dark:text-cyan-400">Ready to share</span>
        </div>
      </InsightCardWrapper>
    );
  }
);

HolographicPassportCard.displayName = 'HolographicPassportCard';
