import defaultArtistCover from '@renderer/assets/images/webp/artist_cover_default.webp';
import Img from '@renderer/components/Img';
import { artistQuery } from '@renderer/queries/artists';
import { listenQuery } from '@renderer/queries/listens';
import { songQuery } from '@renderer/queries/songs';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { memo, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type LinerNotesSlideId = 'bio' | 'signal' | 'stats';

const SLIDE_ORDER: LinerNotesSlideId[] = ['bio', 'signal', 'stats'];
const AUTO_CYCLE_INTERVAL_MS = 12000;

export const FullScreenLinerNotesStage = memo(() => {
  const { t } = useTranslation();
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const volume = useStore(store, (state) => state.player.volume.value);
  const isMuted = useStore(store, (state) => state.player.volume.isMuted);
  const playback = useStore(store, (state) => state.localStorage?.playback);
  const preferredBioSource = useStore(
    store,
    (state) => state.localStorage?.preferences?.preferredArtistBioSource
  );

  const [activeSlide, setActiveSlide] = useState<LinerNotesSlideId>('bio');
  const [isAutoCycle, setIsAutoCycle] = useState(true);
  const [isHovered, setIsHovered] = useState(false);
  const [selectedBioSource, setSelectedBioSource] = useState<'Last.fm' | 'Wikipedia' | undefined>(
    undefined
  );

  const songId = Number(currentSongData.songId);
  const hasValidSongId = Number.isFinite(songId) && songId > 0;

  const primaryArtist = currentSongData.artists?.[0];
  const primaryArtistId = Number(primaryArtist?.artistId);
  const primaryArtistName = primaryArtist?.name ?? '';
  const hasValidArtist =
    Number.isFinite(primaryArtistId) && primaryArtistId > 0 && primaryArtistName.trim().length > 0;

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

  const { data: artistProfile, isLoading: isArtistBioLoading } = useQuery({
    ...artistQuery.onlineProfile({
      artistId: primaryArtistId,
      artistName: primaryArtistName
    }),
    enabled: Boolean(hasValidArtist && window.api?.artistsData?.getArtistOnlineProfile)
  });

  useEffect(() => {
    if (!isAutoCycle || isHovered) return;

    const timer = window.setInterval(() => {
      setActiveSlide((prev) => {
        const idx = SLIDE_ORDER.indexOf(prev);
        return SLIDE_ORDER[(idx + 1) % SLIDE_ORDER.length];
      });
    }, AUTO_CYCLE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [isAutoCycle, isHovered]);

  const activeBio = useMemo(() => {
    if (!artistProfile) return null;
    const available = artistProfile.availableBiographies ?? [];

    if (selectedBioSource) {
      const match = available.find((b) => b.source === selectedBioSource);
      if (match) return match;
    }
    if (preferredBioSource) {
      const prefMatch = available.find((b) => b.source === preferredBioSource);
      if (prefMatch) return prefMatch;
    }
    if (artistProfile.bioSource) {
      const sourceMatch = available.find((b) => b.source === artistProfile.bioSource);
      if (sourceMatch) return sourceMatch;
    }
    if (available.length > 0) return available[0];

    if (artistProfile.bioSummary || artistProfile.bioFull) {
      return {
        source: artistProfile.bioSource,
        summary: artistProfile.bioSummary,
        fullText: artistProfile.bioFull,
        paragraphs: artistProfile.bioParagraphs ?? [],
        url: artistProfile.bioUrl
      };
    }
    return null;
  }, [artistProfile, selectedBioSource, preferredBioSource]);

  const bioParagraphs = useMemo(() => {
    if (!activeBio) return [];
    if (Array.isArray(activeBio.paragraphs) && activeBio.paragraphs.length > 0) {
      return activeBio.paragraphs.slice(0, 3);
    }
    const text = activeBio.summary || activeBio.fullText;
    return text ? [text] : [];
  }, [activeBio]);

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
    const audioData = currentSongData as AudioPlayerData & { sampleRate?: number; bitrate?: number };
    const sampleRateKHz = audioData.sampleRate
      ? `${Math.round((audioData.sampleRate / 1000) * 10) / 10} kHz`
      : '44.1 kHz';
    const bitrateKbps = audioData.bitrate
      ? `${Math.round(audioData.bitrate / 1000)} kbps`
      : undefined;
    const isHiRes = isLossless && (audioData.sampleRate ?? 0) > 48000;

    return {
      extension,
      isLossless,
      isHiRes,
      sampleRateKHz,
      bitrateKbps
    };
  }, [currentSongData]);

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
    const completionRate =
      allTimePlays > 0 ? Math.round((fullListens / allTimePlays) * 100) : 0;

    return {
      allTimePlays,
      fullListens,
      thisMonthPlays,
      skips: skipEvents.length,
      completionRate
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
    if ((playback?.audioFx?.reverbWet ?? 0) > 0 || (playback as unknown as { isReverb?: boolean })?.isReverb) {
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

  const activeSlideIndex = SLIDE_ORDER.indexOf(activeSlide);

  const goToPrevSlide = () => {
    setActiveSlide((prev) => {
      const idx = SLIDE_ORDER.indexOf(prev);
      return SLIDE_ORDER[(idx - 1 + SLIDE_ORDER.length) % SLIDE_ORDER.length];
    });
  };

  const goToNextSlide = () => {
    setActiveSlide((prev) => {
      const idx = SLIDE_ORDER.indexOf(prev);
      return SLIDE_ORDER[(idx + 1) % SLIDE_ORDER.length];
    });
  };

  const slides: Array<{ id: LinerNotesSlideId; label: string; icon: string }> = [
    {
      id: 'bio',
      label: t('fullscreen.carouselArtistBio', 'Artist Bio'),
      icon: 'auto_stories'
    },
    {
      id: 'signal',
      label: t('fullscreen.carouselSignalPath', 'Signal Path'),
      icon: 'graphic_eq'
    },
    {
      id: 'stats',
      label: t('fullscreen.carouselPlayStats', 'Play History & Credits'),
      icon: 'insights'
    }
  ];

  return (
    <div
      data-testid="fullscreen-liner-notes-stage"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="flex h-full w-full flex-col justify-center overflow-hidden px-6 py-8 select-none xl:px-10"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        {/* Carousel Top Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
          <div
            role="tablist"
            aria-label={t('fullscreen.linerNotesTitle', 'Liner Notes Carousel')}
            className="flex items-center gap-1 rounded-full border border-white/10 bg-black/35 p-1 backdrop-blur-md"
          >
            {slides.map((slide) => {
              const isSelected = activeSlide === slide.id;
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`liner-notes-tab-${slide.id}`}
                  onClick={() => setActiveSlide(slide.id)}
                  className={`flex cursor-pointer items-center gap-1.5 rounded-full border-0 px-3 py-1 text-xs font-medium transition-all duration-200 ${
                    isSelected
                      ? 'bg-white text-zinc-950 shadow-sm'
                      : 'bg-transparent text-white/65 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="material-icons-round text-sm">{slide.icon}</span>
                  <span>{slide.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="liner-notes-autocycle-btn"
              aria-pressed={isAutoCycle}
              onClick={() => setIsAutoCycle((prev) => !prev)}
              title={
                isAutoCycle
                  ? t('fullscreen.pauseCarousel', 'Auto-cycling slides (Click to pause)')
                  : t('fullscreen.resumeCarousel', 'Carousel paused (Click to auto-cycle)')
              }
              className={`flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition-colors cursor-pointer ${
                isAutoCycle
                  ? 'border-emerald-400/30 bg-emerald-500/15 text-emerald-300'
                  : 'border-white/15 bg-white/5 text-white/55 hover:text-white'
              }`}
            >
              <span className="material-icons-round text-xs">
                {isAutoCycle ? 'autorenew' : 'pause'}
              </span>
              <span>{isAutoCycle ? 'Auto' : 'Manual'}</span>
            </button>

            <button
              type="button"
              data-testid="liner-notes-prev-btn"
              onClick={goToPrevSlide}
              aria-label={t('common.previous', 'Previous Slide')}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/75 transition-colors hover:bg-white/15 hover:text-white"
            >
              <span className="material-icons-round text-sm">chevron_left</span>
            </button>
            <button
              type="button"
              data-testid="liner-notes-next-btn"
              onClick={goToNextSlide}
              aria-label={t('common.next', 'Next Slide')}
              className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-white/75 transition-colors hover:bg-white/15 hover:text-white"
            >
              <span className="material-icons-round text-sm">chevron_right</span>
            </button>
          </div>
        </div>

        {/* Carousel Viewport */}
        <div className="relative overflow-hidden rounded-2xl">
          <div
            data-testid="liner-notes-carousel-track"
            data-active-slide={activeSlide}
            className="flex transition-transform duration-500 ease-out"
            style={{ transform: `translateX(-${activeSlideIndex * 100}%)` }}
          >
            {/* SLIDE 1: Artist Bio & Editorial Notes */}
            <div className="w-full shrink-0 pr-0.5">
              <div
                data-testid="liner-notes-artist-bio"
                className="flex max-h-[380px] flex-col gap-4 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-black/40 shadow-md">
                      <Img
                        src={artistProfile?.featuredImage?.url || defaultArtistCover}
                        fallbackSrc={defaultArtistCover}
                        alt={primaryArtistName || 'Artist'}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] font-semibold tracking-wider text-white/50 uppercase">
                        {t('fullscreen.artistBiography', 'Artist Biography')}
                      </div>
                      <h3 className="truncate text-lg font-bold text-white">
                        {primaryArtistName || t('common.unknownArtist', 'Unknown Artist')}
                      </h3>
                    </div>
                  </div>

                  {/* Source switcher (Wikipedia / Last.fm) */}
                  {(artistProfile?.availableBiographies?.length ?? 0) > 1 ? (
                    <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/30 p-0.5">
                      {artistProfile!.availableBiographies!.map((b) => {
                        const isSourceActive = activeBio?.source === b.source;
                        return (
                          <button
                            key={b.source}
                            type="button"
                            onClick={() => setSelectedBioSource(b.source)}
                            className={`cursor-pointer rounded-full border-0 px-2.5 py-0.5 text-[11px] font-semibold transition-colors ${
                              isSourceActive
                                ? 'bg-white text-zinc-950'
                                : 'bg-transparent text-white/60 hover:text-white'
                            }`}
                          >
                            {b.source}
                          </button>
                        );
                      })}
                    </div>
                  ) : activeBio?.source ? (
                    <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2.5 py-0.5 text-[11px] font-medium text-white/80">
                      {activeBio.source}
                    </span>
                  ) : null}
                </div>

                {/* Tags */}
                {artistProfile?.tags && artistProfile.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {artistProfile.tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag.name}
                        className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-white/75"
                      >
                        #{tag.name}
                      </span>
                    ))}
                  </div>
                )}

                {/* Bio Text */}
                {isArtistBioLoading ? (
                  <div className="flex items-center gap-2 py-6 text-sm text-white/60">
                    <span className="material-icons-round animate-spin text-base">
                      progress_activity
                    </span>
                    <span>
                      {t('artistProfile.loadingProfile', 'Loading artist biography...')}
                    </span>
                  </div>
                ) : bioParagraphs.length > 0 ? (
                  <div className="space-y-2.5 text-sm leading-relaxed text-white/85">
                    {bioParagraphs.map((para, idx) => (
                      <p key={idx}>{para}</p>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/5 bg-black/25 p-4 text-sm leading-relaxed text-white/70">
                    <p>
                      {t(
                        'fullscreen.artistBioFallback',
                        'Performing "{{title}}" from the album "{{album}}". Connect to the internet or open the Artist Profile to fetch extended Wikipedia & Last.fm editorial liner notes.',
                        {
                          title: currentSongData.title,
                          album:
                            currentSongData.album?.name ||
                            t('common.unknownAlbum', 'Unknown Album')
                        }
                      )}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* SLIDE 2: Audiophile Signal Path & Audio Badge Data */}
            <div className="w-full shrink-0 px-0.5">
              <div
                data-testid="liner-notes-signal-path"
                className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-xl backdrop-blur-xl"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold tracking-wider text-white/60 uppercase">
                      {t('fullscreen.signalPath', 'Audiophile Signal Path')}
                    </span>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="rounded-md border border-white/15 bg-white/10 px-2 py-0.5 text-xs font-bold tracking-wider text-white">
                        {audioSpecs.extension}
                      </span>
                      <span className="text-xs text-white/75">{audioSpecs.sampleRateKHz}</span>
                      {audioSpecs.bitrateKbps && (
                        <span className="text-xs text-white/60">• {audioSpecs.bitrateKbps}</span>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_currentColor]" />
                    {audioSpecs.isHiRes
                      ? 'Hi-Res Lossless'
                      : audioSpecs.isLossless
                        ? 'Lossless Chain'
                        : 'Active DSP Chain'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  {/* Node 1: Source */}
                  <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
                    <span className="material-icons-round mt-0.5 text-lg text-white/70">album</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-white/50 uppercase">
                        Source File
                      </div>
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
                      <div className="truncate text-sm font-semibold text-white">
                        {replayGainText}
                      </div>
                    </div>
                  </div>

                  {/* Node 3: DSP Stage */}
                  <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
                    <span className="material-icons-round mt-0.5 text-lg text-white/70">
                      equalizer
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-white/50 uppercase">
                        DSP Stage
                      </div>
                      <div
                        className="truncate text-sm font-semibold text-white"
                        title={dspSummary}
                      >
                        {dspSummary}
                      </div>
                    </div>
                  </div>

                  {/* Node 4: Output Stage */}
                  <div className="flex items-start gap-3 rounded-xl border border-white/5 bg-black/25 p-3">
                    <span className="material-icons-round mt-0.5 text-lg text-white/70">
                      speaker
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-medium text-white/50 uppercase">
                        Master Output
                      </div>
                      <div className="truncate text-sm font-semibold text-white">
                        {isMuted ? 'Muted (0%)' : `Volume ${Math.round(volume)}%`} • Stereo
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* SLIDE 3: Play History Telemetry & Release Credits */}
            <div className="w-full shrink-0 pl-0.5">
              <div className="flex flex-col gap-3.5">
                <div
                  data-testid="liner-notes-telemetry"
                  className="grid grid-cols-2 gap-2.5 sm:grid-cols-4"
                >
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {stats.allTimePlays}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">
                      Total Plays
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {stats.fullListens}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">
                      Full Listens
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
                    <div className="text-2xl font-bold text-white tabular-nums">
                      {stats.thisMonthPlays}
                    </div>
                    <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">
                      This Month
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3.5 text-center backdrop-blur-xl">
                    <div className="text-2xl font-bold text-white tabular-nums">{stats.skips}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-white/55 uppercase">
                      Skips
                    </div>
                  </div>
                </div>

                <div
                  data-testid="liner-notes-release"
                  className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-xl backdrop-blur-xl"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-xs font-semibold tracking-wider text-white/60 uppercase">
                      {t('fullscreen.releaseCredits', 'Release & Catalogue Metadata')}
                    </span>
                    <span className="text-xs text-white/60">
                      Completion Rate: <strong className="text-white">{stats.completionRate}%</strong>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm">
                    <div>
                      <span className="block text-[11px] text-white/45 uppercase">Album</span>
                      <span className="font-medium text-white/90">
                        {currentSongData.album?.name || t('common.unknownAlbum', 'Unknown Album')}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-white/45 uppercase">
                        Release Year
                      </span>
                      <span className="font-medium text-white/90">
                        {songInfo?.year ? String(songInfo.year) : '—'}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-white/45 uppercase">Genres</span>
                      <span className="font-medium text-white/90">{genreNames || '—'}</span>
                    </div>
                    <div>
                      <span className="block text-[11px] text-white/45 uppercase">
                        Track Number
                      </span>
                      <span className="font-medium text-white/90">
                        {songInfo?.trackNo ? `#${songInfo.trackNo}` : '—'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Dot Indicators */}
        <div className="flex items-center justify-center gap-2 pt-1">
          {slides.map((slide) => {
            const isSelected = activeSlide === slide.id;
            return (
              <button
                key={slide.id}
                type="button"
                aria-label={slide.label}
                onClick={() => setActiveSlide(slide.id)}
                className={`h-1.5 cursor-pointer rounded-full border-0 transition-all duration-300 ${
                  isSelected ? 'w-6 bg-white' : 'w-1.5 bg-white/30 hover:bg-white/50'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});

FullScreenLinerNotesStage.displayName = 'FullScreenLinerNotesStage';
export default FullScreenLinerNotesStage;

