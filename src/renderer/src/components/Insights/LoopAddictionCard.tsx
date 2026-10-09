import { memo } from 'react';

import type { LoopAddictionItem } from '../../queries/analytics';
import { InsightCardWrapper } from './InsightCardWrapper';

interface LoopAddictionCardProps {
  loopAddiction?: LoopAddictionItem;
}

export const LoopAddictionCard = memo(({ loopAddiction }: LoopAddictionCardProps) => {
  const hasAddiction = loopAddiction?.hasAddiction ?? false;
  const streakCount = loopAddiction?.streakCount ?? 0;
  const songTitle = loopAddiction?.title ?? 'No Binge Detected';
  const loopMinutes = loopAddiction?.totalLoopMinutes ?? 0;
  const lastPlayed = loopAddiction?.lastPlayedAt;

  return (
    <InsightCardWrapper
      glowColor="fuchsia"
      className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 flex flex-col justify-between p-5 shadow-sm backdrop-blur-md transition-all hover:border-fuchsia-500/40"
    >
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-fuchsia-500/15 text-fuchsia-500">
              <span className="material-icons-round text-lg">repeat</span>
            </span>
            <div>
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                Obsessive Loop Addiction
              </span>
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                Consecutive Replay Detector
              </p>
            </div>
          </div>
          {hasAddiction ? (
            <span className="animate-pulse rounded-full border border-fuchsia-500/30 bg-fuchsia-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-fuchsia-600 dark:text-fuchsia-400">
              {streakCount}x Consecutive
            </span>
          ) : (
            <span className="border-background-color-2/70 bg-background-color-2/20 text-font-color-dimmed dark:text-dark-font-color-dimmed rounded-full border px-2 py-0.5 text-[10px]">
              Balanced
            </span>
          )}
        </div>

        {/* Featured Binge Track Banner */}
        <div className="mb-3 flex items-center gap-3.5 rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-3.5 dark:bg-fuchsia-950/20">
          <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-tr from-fuchsia-600 to-indigo-600 shadow-md shadow-fuchsia-500/20">
            <span
              className={`material-icons-round text-2xl text-white ${
                hasAddiction ? 'animate-spin' : ''
              }`}
              style={{ animationDuration: '6s' }}
            >
              album
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold tracking-wider text-fuchsia-600 uppercase dark:text-fuchsia-400">
              {hasAddiction ? 'Single-Session Binge' : 'Healthy Rotation'}
            </span>
            <h4
              title={songTitle}
              className="text-font-color-black dark:text-font-color-white truncate text-sm font-bold"
            >
              {songTitle}
            </h4>
            <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 flex items-center gap-2 font-mono text-[11px]">
              {hasAddiction ? (
                <>
                  <span>~{loopMinutes}m on repeat</span>
                  {lastPlayed && (
                    <>
                      <span>•</span>
                      <span>{lastPlayed}</span>
                    </>
                  )}
                </>
              ) : (
                <span>Varied listening session</span>
              )}
            </div>
          </div>
        </div>

        <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-center text-xs">
          {hasAddiction
            ? 'You were locked in a loop vortex with this song!'
            : 'No repetitive loop addictions recorded during this period.'}
        </p>
      </div>

      {/* Footer Info */}
      <div className="border-background-color-2/60 dark:border-dark-background-color-2/60 text-font-color-dimmed dark:text-dark-font-color-dimmed mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
        <span>
          Obsession Score:{' '}
          <strong className="font-semibold text-fuchsia-500">
            {hasAddiction ? 'Severe Loopitis' : 'Zen Harmony'}
          </strong>
        </span>
        <span className="font-medium text-fuchsia-500">
          {hasAddiction ? 'Replay Addiction' : 'Varied'}
        </span>
      </div>
    </InsightCardWrapper>
  );
});

LoopAddictionCard.displayName = 'LoopAddictionCard';
