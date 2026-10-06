import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo, useMemo } from 'react';

export const FullScreenAudioBadge = memo(() => {
  const currentSongData = useStore(store, (state) => state.currentSongData);

  const specs = useMemo(() => {
    if (!currentSongData || !currentSongData.songId) return null;

    const path = currentSongData.path || '';
    const extension = path.includes('.') ? path.split('.').pop()?.toUpperCase() : '';

    const isLossless = ['FLAC', 'WAV', 'ALAC', 'AIFF', 'DSD', 'APE'].includes(extension || '');
    const sampleRateKHz = currentSongData.sampleRate
      ? Math.round((currentSongData.sampleRate / 1000) * 10) / 10
      : undefined;
    const isHiRes = isLossless && (currentSongData.sampleRate ?? 0) > 48000;

    const bitrateKbps = currentSongData.bitrate
      ? Math.round(currentSongData.bitrate / 1000)
      : undefined;

    if (!extension && !bitrateKbps && !sampleRateKHz) return null;

    return {
      extension: extension || 'AUDIO',
      isLossless,
      isHiRes,
      sampleRateKHz,
      bitrateKbps
    };
  }, [currentSongData]);

  if (!specs) return null;

  return (
    <div
      data-testid="fullscreen-audio-badge"
      className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/80 select-none"
    >
      {specs.isLossless && (
        <span className="bg-font-color-highlight/25 border-font-color-highlight/40 text-font-color-highlight rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase shadow-xs backdrop-blur-md">
          {specs.isHiRes ? 'Hi-Res Lossless' : 'Lossless'}
        </span>
      )}
      <span className="rounded-md bg-white/10 px-2 py-0.5 backdrop-blur-md">{specs.extension}</span>
      {specs.sampleRateKHz && (
        <span className="rounded-md bg-white/10 px-2 py-0.5 backdrop-blur-md">
          {specs.sampleRateKHz} kHz
        </span>
      )}
      {!specs.isLossless && specs.bitrateKbps && (
        <span className="rounded-md bg-white/10 px-2 py-0.5 backdrop-blur-md">
          {specs.bitrateKbps} kbps
        </span>
      )}
    </div>
  );
});

FullScreenAudioBadge.displayName = 'FullScreenAudioBadge';
export default FullScreenAudioBadge;
