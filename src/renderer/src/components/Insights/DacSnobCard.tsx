import { memo } from 'react';

import type { AudiophileListeningMetrics, LibraryAudioStatsData } from '../../queries/analytics';
import { InsightCardWrapper } from './InsightCardWrapper';

interface DacSnobCardProps {
  metrics?: AudiophileListeningMetrics;
  stats?: LibraryAudioStatsData;
}

export const DacSnobCard = memo(({ metrics, stats }: DacSnobCardProps) => {
  const losslessPct = metrics?.losslessPercentage ?? 0;
  const pcmGb = metrics?.rawPcmGigabytes ?? 0;
  const tier = metrics?.resolutionTier ?? 'Standard Lossless';
  const dominantRes = metrics?.dominantResolution ?? '16-bit / 44.1kHz';
  const spectrum = metrics?.spectrum ?? {
    hiResPercent: 0,
    cdQualityPercent: 100,
    mp3HighPercent: 0,
    lossyOtherPercent: 0
  };

  const peakRateKhz = metrics?.peakSampleRate ? (metrics.peakSampleRate / 1000).toFixed(1) : '44.1';

  return (
    <InsightCardWrapper
      glowColor="amber"
      className="border-background-color-2/70 bg-background-color-1/80 dark:border-dark-background-color-2/70 dark:bg-dark-background-color-1/80 flex flex-col justify-between p-5 shadow-sm backdrop-blur-md transition-all hover:border-amber-500/40"
    >
      <div>
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
              <span className="material-icons-round text-lg">equalizer</span>
            </span>
            <div>
              <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-xs font-semibold tracking-wider uppercase">
                The DAC Snob Quotient
              </span>
              <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed text-[11px]">
                Audio Purity &amp; DAC Volume
              </p>
            </div>
          </div>
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-600 dark:text-amber-400">
            {losslessPct}% Lossless
          </span>
        </div>

        {/* Raw PCM Audio Pumped Banner */}
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 dark:bg-amber-950/20">
          <span className="block text-[10px] font-bold tracking-wider text-amber-600 uppercase dark:text-amber-400">
            Raw PCM Audio Streamed to DAC
          </span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-font-color-black dark:text-font-color-white font-mono text-3xl font-extrabold tracking-tight">
              {pcmGb}
            </span>
            <span className="font-mono text-xs font-bold text-amber-600 uppercase dark:text-amber-400">
              GIGABYTES
            </span>
          </div>
          <p className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-0.5 text-[11px]">
            Uncompressed PCM decoded directly by system DAC
          </p>
        </div>

        {/* Resolution Spectrum Breakdown */}
        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="text-font-color-black dark:text-font-color-white font-medium">
              Resolution Spectrum
            </span>
            <span className="font-mono text-[11px] text-amber-600 dark:text-amber-400">
              {dominantRes}
            </span>
          </div>

          <div className="border-background-color-2/40 bg-background-color-2/20 dark:border-dark-background-color-2/40 dark:bg-dark-background-color-2/20 flex h-3 w-full overflow-hidden rounded-full border p-0.5">
            <div
              style={{ width: `${spectrum.hiResPercent}%` }}
              title={`Hi-Res 24-bit (${spectrum.hiResPercent}%)`}
              className="rounded-l-full bg-amber-400"
            />
            <div
              style={{ width: `${spectrum.cdQualityPercent}%` }}
              title={`16-bit FLAC/WAV (${spectrum.cdQualityPercent}%)`}
              className="bg-cyan-500"
            />
            <div
              style={{ width: `${spectrum.mp3HighPercent}%` }}
              title={`320kbps High (${spectrum.mp3HighPercent}%)`}
              className="bg-indigo-500"
            />
            <div
              style={{ width: `${spectrum.lossyOtherPercent}%` }}
              title={`Other Lossy (${spectrum.lossyOtherPercent}%)`}
              className="rounded-r-full bg-slate-500"
            />
          </div>

          {/* Legend */}
          <div className="text-font-color-dimmed dark:text-dark-font-color-dimmed mt-2 grid grid-cols-4 gap-1 text-center font-mono text-[10px]">
            <div className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full bg-amber-400" />
              <span>Hi-Res</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full bg-cyan-500" />
              <span>16-bit</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full bg-indigo-500" />
              <span>320k</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-500" />
              <span>Lossy</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="border-background-color-2/60 dark:border-dark-background-color-2/60 text-font-color-dimmed dark:text-dark-font-color-dimmed mt-4 flex items-center justify-between border-t pt-3 text-[11px]">
        <span>
          Peak Sample Rate:{' '}
          <strong className="text-font-color-black dark:text-font-color-white font-mono font-bold">
            {peakRateKhz} kHz
          </strong>
        </span>
        <span className="font-semibold text-amber-500">Tier: {tier}</span>
      </div>
    </InsightCardWrapper>
  );
});

DacSnobCard.displayName = 'DacSnobCard';
