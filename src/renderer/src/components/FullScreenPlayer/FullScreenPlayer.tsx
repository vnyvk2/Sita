import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import useMouseActiveState from '../../hooks/useMouseActiveState';
import { useLyricsQuery } from '../../queries/lyrics';
import AuroraBackground from '../fx/AuroraBackground';
import BorderBeam from '../fx/BorderBeam';
import ParticlesLayer from '../fx/ParticlesLayer';
import Img from '../Img';
import TitleBar from '../TitleBar/TitleBar';
import FullScreenAudioBadge from './components/FullScreenAudioBadge';
import FullScreenControls from './components/FullScreenControls';
import FullScreenQueueDrawer from './components/FullScreenQueueDrawer';
import FullScreenSeekbar from './components/FullScreenSeekbar';
import LyricsContainer from './containers/LyricsContainer';

const isInteractiveShortcutTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable]'));
};

const FullScreenPlayer = () => {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const volume = useStore(store, (state) => state.player.volume.value);

  const { updatePlayerType, toggleSongPlayback, updateVolume } = useContext(AppUpdateContext);
  const player = useAudioPlayer();
  const { t } = useTranslation();

  const [isLyricsVisible, setIsLyricsVisible] = useState(false);
  const [isQueueVisible, setIsQueueVisible] = useState(false);

  const { data: lyrics, isPending: isLyricsPending } = useLyricsQuery({
    enabled: isLyricsVisible
  });
  const isLyricsAvailable = Boolean(lyrics?.lyrics);
  // Hold split layout during fetch to avoid Showcase -> Split snap on late resolve
  const isSplitLayout = isLyricsVisible && (isLyricsAvailable || isLyricsPending);

  const fullScreenPlayerContainerRef = useRef<HTMLDivElement>(null);
  const { isMouseActive } = useMouseActiveState(fullScreenPlayerContainerRef, {
    idleTimeout: 4000,
    range: 20,
    idleOnMouseOut: true
  });

  // Screen sleeping prevention
  useEffect(() => {
    if (preferences.allowToPreventScreenSleeping && !preferences.removeAnimationsOnBatteryPower)
      window.api.appControls.stopScreenSleeping();
    else window.api.appControls.allowScreenSleeping();
    return () => window.api.appControls.allowScreenSleeping();
  }, [preferences.allowToPreventScreenSleeping, preferences.removeAnimationsOnBatteryPower]);

  // Background artwork
  const imgPath = useMemo(() => {
    return currentSongData.artworkPath;
  }, [currentSongData?.artworkPath]);

  const isAmbientParticlesEnabled = useStore(
    store,
    (state) => state.localStorage.preferences?.ambientParticles ?? false
  );
  const isFxSystemPaused = useStore(
    store,
    (state) =>
      state.isOnBatteryPower &&
      (state.localStorage.preferences?.reduceVisualEffectsOnBattery ?? false)
  );
  const isReducedMotionPref = useStore(
    store,
    (state) => state.localStorage.preferences?.isReducedMotion ?? false
  );

  // Keyboard ergonomics for Cinema/Fullscreen Mode
  // Single owner for Escape when queue is concerned is here; drawer has no own listener
  // to avoid capture/bubble double-handling on window.
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInteractiveShortcutTarget(e.target)) return;
      if (e.repeat && (e.key === ' ' || e.key === 'l' || e.key === 'L' || e.key === 'q' || e.key === 'Q'))
        return;

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          if (isQueueVisible) {
            setIsQueueVisible(false);
          } else {
            updatePlayerType('normal');
          }
          break;
        case ' ':
          // Avoid double-toggle when focus is on a button (native activation + window handler)
          if (e.target instanceof Element && e.target.closest('button')) return;
          e.preventDefault();
          toggleSongPlayback();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (player && Number.isFinite(player.duration)) {
            player.currentTime = Math.max(0, player.currentTime - 5);
          } else if (player) {
            player.currentTime = Math.max(0, player.currentTime - 5);
          }
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (player && Number.isFinite(player.duration)) {
            player.currentTime = Math.min(player.duration, player.currentTime + 5);
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          updateVolume(Math.min(100, volumeRef.current + 5));
          break;
        case 'ArrowDown':
          e.preventDefault();
          updateVolume(Math.max(0, volumeRef.current - 5));
          break;
        case 'l':
        case 'L':
          setIsLyricsVisible((prev) => !prev);
          break;
        case 'q':
        case 'Q':
          setIsQueueVisible((prev) => !prev);
          break;
        default:
          break;
      }
    },
    [isQueueVisible, player, toggleSongPlayback, updatePlayerType, updateVolume]
  );

  const closeQueueDrawer = useCallback(() => setIsQueueVisible(false), []);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const isControlsVisible = isMouseActive || !isCurrentSongPlaying;

  return (
    <div
      ref={fullScreenPlayerContainerRef}
      data-testid="fullscreen-player"
      data-fx-paused={!isCurrentSongPlaying || undefined}
      className={`full-screen-player dark bg-dark-background-color-1! relative ${
        !isCurrentSongPlaying ? 'paused' : ''
      } ${
        preferences?.isReducedMotion ? 'reduced-motion' : ''
      } grid !h-screen w-full grid-rows-[auto_1fr] overflow-hidden select-none ${
        !isControlsVisible ? 'cursor-none' : ''
      }`}
    >
      {/* Immersive Dynamic Backdrop */}
      <div className="background-cover-img-container pointer-events-none absolute top-0 left-0 h-full w-full overflow-hidden">
        <Img
          src={imgPath}
          fallbackSrc={DefaultSongCover}
          loading="eager"
          alt="Song Cover"
          className="h-full w-full object-cover shadow-lg blur-[2.5rem]! brightness-[.22]! transition-[filter] delay-100 duration-300 ease-in-out"
        />
        {isAmbientParticlesEnabled && (
          <ParticlesLayer
            isActive={isCurrentSongPlaying}
            isSystemPaused={isFxSystemPaused || isReducedMotionPref}
          />
        )}
        <AuroraBackground
          animated={!preferences?.isReducedMotion}
          intensity={0.35}
          colors={['var(--fx-accent)', 'var(--fx-accent-third)', 'var(--fx-accent-alt)']}
        />
      </div>

      {/* Top TitleBar (fades gracefully when idle in cinema mode) */}
      <div
        className={`relative z-40 transition-opacity duration-300 ${
          isControlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <TitleBar />
      </div>

      {/* Main Adaptive Stage Area */}
      <main className="relative z-10 flex h-full w-full overflow-hidden">
        {isSplitLayout ? (
          /* Mode A: Split View (42% Left Hero & Controls, 58% Right Synced Lyrics) */
          <div data-testid="fullscreen-split-layout" className="flex h-full w-full overflow-hidden">
            {/* Left Column: Cover Art, Metadata, Badges, Seekbar & Controls */}
            <section className="z-10 flex h-full w-[44%] max-w-xl min-w-[360px] flex-col justify-between overflow-hidden p-8 xl:p-12">
              {/* Artwork & Metadata */}
              <div className="flex flex-col gap-4">
                <BorderBeam
                  className="aspect-square w-56 rounded-2xl shadow-2xl xl:w-64"
                  thickness={1.5}
                  duration={9}
                  animated={isCurrentSongPlaying && !preferences?.isReducedMotion}
                >
                  <Img
                    src={currentSongData.artworkPath}
                    fallbackSrc={DefaultSongCover}
                    loading="eager"
                    alt={currentSongData.title || 'Song Cover'}
                    className="h-full w-full rounded-2xl object-cover shadow-2xl"
                  />
                </BorderBeam>

                <div className="mt-2 flex max-w-full flex-col gap-1">
                  <h1
                    className="truncate text-2xl font-bold tracking-tight text-white xl:text-3xl"
                    title={currentSongData.title}
                  >
                    {currentSongData.title || t('common.unknownTrack', 'Unknown Track')}
                  </h1>
                  <p
                    className="truncate text-base font-medium text-white/80 xl:text-lg"
                    title={currentSongData.artists?.map((a) => a.name).join(', ')}
                  >
                    {currentSongData.artists?.map((a) => a.name).join(', ') ||
                      t('common.unknownArtist')}
                  </p>
                  {currentSongData.album?.name && (
                    <p
                      className="truncate text-xs text-white/50 xl:text-sm"
                      title={currentSongData.album.name}
                    >
                      {currentSongData.album.name}
                    </p>
                  )}
                  <div className="mt-2">
                    <FullScreenAudioBadge />
                  </div>
                </div>
              </div>

              {/* Bottom Dock: Seekbar and Playback Transport Controls */}
              <div
                className={`flex flex-col gap-3 transition-opacity duration-300 ${
                  isControlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <FullScreenSeekbar />
                <FullScreenControls
                  isLyricsVisible={isLyricsVisible}
                  setIsLyricsVisible={setIsLyricsVisible}
                  isQueueVisible={isQueueVisible}
                  setIsQueueVisible={setIsQueueVisible}
                />
              </div>
            </section>

            {/* Right Column: Full-Height Clean Synced Lyrics */}
            <section className="relative z-10 h-full flex-1 overflow-hidden">
              <LyricsContainer
                isLyricsVisible={isLyricsVisible}
                lyricsData={lyrics}
                lyricsLoading={isLyricsPending}
                className="relative flex h-full w-full flex-col items-start overflow-y-auto px-8 py-10 select-text"
              />
            </section>
          </div>
        ) : (
          /* Mode B: Centered Hero Showcase (No Lyrics / Lyrics Inactive) */
          <div
            data-testid="fullscreen-showcase-layout"
            className="z-10 flex h-full w-full items-center justify-center p-6"
          >
            <div className="flex h-full max-h-[85vh] w-full max-w-2xl flex-col items-center justify-center">
              {/* Hero Album Art with Ambient Backlight Reflection */}
              <div className="group relative flex items-center justify-center">
                {/* Backlight reflection */}
                <div className="pointer-events-none absolute inset-0 aspect-square w-72 scale-105 rounded-3xl bg-black/50 opacity-40 blur-3xl sm:w-80 md:w-96" />

                <BorderBeam
                  className="relative aspect-square w-72 rounded-3xl shadow-2xl sm:w-80 md:w-96"
                  thickness={2}
                  duration={10}
                  animated={isCurrentSongPlaying && !preferences?.isReducedMotion}
                >
                  <Img
                    src={currentSongData.artworkPath}
                    fallbackSrc={DefaultSongCover}
                    loading="eager"
                    alt={currentSongData.title || 'Song Cover'}
                    className="h-full w-full rounded-3xl object-cover shadow-2xl"
                  />
                </BorderBeam>
              </div>

              {/* Track Metadata */}
              <div className="mt-6 flex max-w-full flex-col items-center px-4 text-center">
                <h1
                  className="max-w-full truncate text-3xl font-bold tracking-tight text-white sm:text-4xl md:text-5xl"
                  title={currentSongData.title}
                >
                  {currentSongData.title || t('common.unknownTrack', 'Unknown Track')}
                </h1>
                <p
                  className="mt-2 max-w-full truncate text-lg font-medium text-white/80 sm:text-xl"
                  title={currentSongData.artists?.map((a) => a.name).join(', ')}
                >
                  {currentSongData.artists?.map((a) => a.name).join(', ') ||
                    t('common.unknownArtist')}
                </p>
                {currentSongData.album?.name && (
                  <p
                    className="mt-1 max-w-full truncate text-sm text-white/50"
                    title={currentSongData.album.name}
                  >
                    {currentSongData.album.name}
                  </p>
                )}
                <div className="mt-3 flex justify-center">
                  <FullScreenAudioBadge />
                </div>
              </div>

              {/* Centered Modern Dock: Seekbar and Controls */}
              <div
                className={`mt-6 flex w-full max-w-xl flex-col gap-3 transition-opacity duration-300 ${
                  isControlsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
                }`}
              >
                <FullScreenSeekbar />
                <FullScreenControls
                  isLyricsVisible={isLyricsVisible}
                  setIsLyricsVisible={setIsLyricsVisible}
                  isQueueVisible={isQueueVisible}
                  setIsQueueVisible={setIsQueueVisible}
                />
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Slide-over Queue Peek Drawer */}
      <FullScreenQueueDrawer isOpen={isQueueVisible} onClose={closeQueueDrawer} />
    </div>
  );
};

export default FullScreenPlayer;
