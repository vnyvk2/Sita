import { memo } from 'react';

import type { SkipForensicsData } from '../../queries/analytics';
import { InsightCardWrapper } from './InsightCardWrapper';

interface SkipCrimeSceneCardProps {
  skipForensics?: SkipForensicsData;
}

export const SkipCrimeSceneCard = memo(({ skipForensics }: SkipCrimeSceneCardProps) => {
  if (!skipForensics || skipForensics.totalSkips === 0) {
    return (
      <InsightCardWrapper
        glowColor="rose"
        className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 p-5 shadow-sm backdrop-blur-md"
      >
        <div className="mb-3 flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/10 text-rose-500">
            <span className="material-icons-round text-lg">psychology_alt</span>
          </span>
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
            Skip Crime Scene
          </span>
        </div>
        <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs">
          Zero skips recorded for this period. Pure listening bliss!
        </p>
      </InsightCardWrapper>
    );
  }

  const { patienceScore, archetype, attentionCliff, coldShoulder, theTragedy, totalSkips } =
    skipForensics;

  const maxCliffCount = Math.max(...attentionCliff.map((c) => c.count), 1);

  return (
    <InsightCardWrapper
      glowColor="rose"
      className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 flex flex-col justify-between p-5 shadow-sm backdrop-blur-md transition-all hover:border-rose-500/40"
    >
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-500/15 text-rose-500">
              <span className="material-icons-round text-lg">heart_broken</span>
            </span>
            <div>
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                The Skip Crime Scene
              </span>
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                Attention Span Forensics
              </p>
            </div>
          </div>
          <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            {patienceScore}% Patience
          </span>
        </div>

        {/* Attention Cliff Histogram */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-font-color-black dark:text-font-color-white font-medium">
              The 30-Second Attention Cliff
            </span>
            <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
              Where you hit skip
            </span>
          </div>

          <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 flex h-20 items-end gap-1.5 rounded-xl border p-2">
            {attentionCliff.map((b) => {
              const heightPct = Math.max(12, Math.round((b.count / maxCliffCount) * 100));
              const isDropOffPeak = b.count === maxCliffCount && b.count > 0;

              return (
                <div
                  key={b.label}
                  title={`${b.label}: ${b.count} skips (${b.percentage}%)`}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end"
                >
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t-sm transition-all duration-300 ${
                      isDropOffPeak
                        ? 'bg-rose-500 shadow-sm shadow-rose-500/50'
                        : 'bg-rose-500/30 group-hover:bg-rose-500/60'
                    }`}
                  />
                  <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-1 font-mono text-[10px]">
                    {b.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Awards: Cold Shoulder & The Tragedy */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {coldShoulder && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-2.5 dark:bg-rose-950/20">
              <span className="block text-[10px] font-semibold tracking-wider text-rose-600 uppercase dark:text-rose-400">
                Cold Shoulder Award
              </span>
              <p className="text-font-color-black dark:text-font-color-white mt-0.5 truncate font-bold">
                Skipped in {coldShoulder.positionSecs}s
              </p>
              <p
                title={coldShoulder.title}
                className="text-font-color-dimmed dark:text-dark-font-color-dimmed truncate text-[11px]"
              >
                {coldShoulder.title}
              </p>
            </div>
          )}

          {theTragedy && (
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-2.5 dark:bg-purple-950/20">
              <span className="block text-[10px] font-semibold tracking-wider text-purple-600 uppercase dark:text-purple-400">
                The Tragedy Award
              </span>
              <p className="text-font-color-black dark:text-font-color-white mt-0.5 truncate font-bold">
                Skipped at {theTragedy.completionPercentage}%
              </p>
              <p
                title={theTragedy.title}
                className="text-font-color-dimmed dark:text-dark-font-color-dimmed truncate text-[11px]"
              >
                {theTragedy.title}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-background-color-2/60 dark:border-dark-background-color-2/60 text-font-color-dimmed dark:text-dark-font-color-dimmed mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
        <span>
          Archetype:{' '}
          <strong className="text-font-color-black dark:text-font-color-white font-semibold">
            {archetype}
          </strong>
        </span>
        <span className="font-mono font-medium text-rose-500">{totalSkips} skips</span>
      </div>
    </InsightCardWrapper>
  );
});

SkipCrimeSceneCard.displayName = 'SkipCrimeSceneCard';
