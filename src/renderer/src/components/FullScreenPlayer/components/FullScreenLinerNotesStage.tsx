import { listenQuery } from '@renderer/queries/listens';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

export const FullScreenLinerNotesStage = memo(() => {
  const { t } = useTranslation();
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const volume = useStore(store, (state) => state.player.volume.value);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const playback = useStore(store, (state) => state.localStorage?.playback);

  const songId = Number(currentSongData.songId);
  const hasValidSongId = Number.isFinite(songId) && songId > 0;

  const { data: songInfo } = useQuery({
    ...songQuery.singleSongInfo({ songId }),
    enabled: Boolean(hasValidSongId && window.api?.audioLibraryControls?.getSongInfo),
    select: (data) => (Array.isArray(data) && data.length > 0 ? data[0] : undefined)
  });

  const { data: listeningData } = useQuery({
    ...listenQuery.single({ songId }),
    enabled: Boolean(hasValidSongId && window.api?.audioLibraryControls?.getSongListeningData),
    select: (data) => (Array.isArray(data) && data.length > 0 ? data[0] : undefined)
  });

  const audioSpecs = useMemo(() => {
    const path = currentSongData.path || '';
    const cleanPath = path.split(/[?#]/)[0] ?? '';
    const basename = cleanPath.split(/[\\/]/).pop() ?? '';
    const dotIndex = basename.lastIndexOf('.');
    const extension =
      dotIndex > 0 && dotIndex < basename.length - 1
        ? basename.slice(dotIndex + 1).toUpperCase()
        : 'AUDIO';

    const isLossless = ['FLAC', 'WAV', 'ALAC', 'AIFF', 'DSD', 'APE'].includes(extension);
    const sampleRateKHz = currentSongData.sampleRate
      ? `${Math.round((currentSongData.sampleRate / 1000) * 10) / 10} kHz`
      : '44.1 kHz';
    const bitrateKbps = currentSongData.bitrate
      ? `${Math.round(currentSongData.bitrate / 1000)} kbps`
      : undefined;
    const isHiRes = isLossless && (currentSongData.sampleRate ?? 0) > 48000;

    return {
      extension,
      isLossless,
      isHiRes,
      sampleRateKHz,
      bitrateKbps
    };
  }, [currentSongData.path, currentSongData.sampleRate, currentSongData.bitrate]);

  const stats = useMemo(() => {
    const playEvents = listeningData?.playEvents ?? [];
    const skipEvents = listeningData?.skipEvents ?? [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    const allTimePlays = playEvents.length;
    const fullListens = playEvents.filter(
      (pe) => Number.parseFloat(pe.playbackPercentage) > 0.99
    ).length;
    const thisMonthPlays = playEvents.filter((pe) => {
      const d = new Date(pe.createdAt);
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    }).length;

    return {
      allTimePlays,
      fullListens,
      thisMonthPlays,
      skips: skipEvents.length
    };
  }, [listeningData]);

  const dspSummary = useMemo(() => {
    const activeNodes: string[] = [];
    if (playback?.isKaraoke) {
      activeNodes.push(`Sing Vocal Reducer (${Math.round(playback.karaokeLevel ?? 100)}%)`);
    }
    if (playback?.isNightMode) {
      activeNodes.push('Night Mode Dynamics');
    }
    if (playback?.isReverb) {
      activeNodes.push('Convolver Reverb');
    }
    if (activeNodes.length === 0) {
      return 'Bit-Transparent / Direct DSP Pass';
    }
    return activeNodes.join(' • ');
  }, [playback]);

  const replayGainText = useMemo(() => {
    const rg = currentSongData.replayGain;
    if (rg?.trackGain != null) {
      const sign = rg.trackGain > 0 ? '+' : '';
      return `${sign}${rg.trackGain.toFixed(1)} dB (ITU-R BS.1770)`;
    }
    return 'Unity Gain (0.0 dB)';
  }, [currentSongData.replayGain]);

  const genreNames = useMemo(() => {
    if (Array.isArray(songInfo?.genres) && songInfo.genres.length > 0) {
      return songInfo.genres.map((g) => g.name).join(' • ');
    }
    return undefined;
  }, [songInfo?.genres]);

  return (
    <div
      data-testid="fullscreen-liner-notes-stage"
      className="flex h-full w-full flex-col justify-center overflow-y-auto px-6 py-8 select-none xl:px-10"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        {/* Section Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="material-icons-round text-font-color-highlight text-xl">
              graphic_eq
            </span>
            <h2 className="text-sm font-bold tracking-widest text-white/90 uppercase">
              {t('fullscreen.linerNotesTitle', 'Audiophile Signal Path & Liner Notes')}
            </h2>
          </div>
          <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/80 backdrop-blur-md">
            {audioSpecs.isHiRes
              ? 'Hi-Res Lossless'
              : audioSpecs.isLossless
                ? 'Lossless Audio'
                : 'Compressed Stream'}
          </span>
        </div>

        {/* 1. Audiophile Signal Path Pipeline */}
        <div
          data-testid="liner-notes-signal-path"
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-xl"
        >
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-white/60 uppercase">
              {t('fullscreen.signalPath', 'Signal Path')}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-400">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_currentColor]" />
              {audioSpecs.isLossless ? 'Lossless Chain' : 'Active Chain'}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* Node 1: Source */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
              <span className="material-icons-round mt-0.5 text-lg text-white/70">album</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-white/50 uppercase">Source File</div>
                <div className="truncate text-sm font-semibold text-white">
                  {audioSpecs.extension} • {audioSpecs.sampleRateKHz}
                  {audioSpecs.bitrateKbps ? ` • ${audioSpecs.bitrateKbps}` : ''}
                </div>
              </div>
            </div>

            {/* Node 2: Loudness Normalization */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
              <span className="material-icons-round mt-0.5 text-lg text-white/70">tune</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-white/50 uppercase">
                  Loudness Headroom
                </div>
                <div className="truncate text-sm font-semibold text-white">{replayGainText}</div>
              </div>
            </div>

            {/* Node 3: DSP Stage */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
              <span className="material-icons-round mt-0.5 text-lg text-white/70">equalizer</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-white/50 uppercase">DSP Stage</div>
                <div className="truncate text-sm font-semibold text-white" title={dspSummary}>
                  {dspSummary}
                </div>
              </div>
            </div>

            {/* Node 4: Output Stage */}
            <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
              <span className="material-icons-round mt-0.5 text-lg text-white/70">speaker</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-medium text-white/50 uppercase">Master Output</div>
                <div className="truncate text-sm font-semibold text-white">
                  {isMuted ? 'Muted (0%)' : `Volume ${Math.round(volume)}%`} • Stereo
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Listening Telemetry Card */}
        <div
          data-testid="liner-notes-telemetry"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
            <div className="text-2xl font-bold text-white tabular-nums">{stats.allTimePlays}</div>
            <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">
              Total Plays
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
            <div className="text-2xl font-bold text-white tabular-nums">{stats.fullListens}</div>
            <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">
              Full Listens
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
            <div className="text-2xl font-bold text-white tabular-nums">{stats.thisMonthPlays}</div>
            <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">This Month</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
            <div className="text-2xl font-bold text-white tabular-nums">{stats.skips}</div>
            <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">Skips</div>
          </div>
        </div>

        {/* 3. Release Metadata & Liner Credits */}
        <div
          data-testid="liner-notes-release"
          className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-xl"
        >
          <div className="mb-3 text-xs font-semibold tracking-wider text-white/60 uppercase">
            {t('fullscreen.releaseCredits', 'Release & Catalogue Metadata')}
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
            <div>
              <span className="block text-[11px] text-white/45 uppercase">Album</span>
              <span className="font-medium text-white/90">
                {currentSongData.album?.name || t('common.unknownAlbum', 'Unknown Album')}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-white/45 uppercase">Release Year</span>
              <span className="font-medium text-white/90">
                {songInfo?.year ? String(songInfo.year) : '—'}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-white/45 uppercase">Genres</span>
              <span className="font-medium text-white/90">{genreNames || '—'}</span>
            </div>
            <div>
              <span className="block text-[11px] text-white/45 uppercase">Track Number</span>
              <span className="font-medium text-white/90">
                {songInfo?.trackNo ? `#${songInfo.trackNo}` : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

FullScreenLinerNotesStage.displayName = 'FullScreenLinerNotesStage';
export default FullScreenLinerNotesStage;
