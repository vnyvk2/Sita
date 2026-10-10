import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../../assets/images/webp/song_cover_default.webp';
import Img from '../../Img';

interface FullScreenVinylStageProps {
  artworkPath?: string;
  title?: string;
  duration?: number;
  isPlaying: boolean;
  isReducedMotion?: boolean;
  compact?: boolean;
  onTogglePlay: () => void;
}

export const FullScreenVinylStage = memo(
  ({
    artworkPath,
    title,
    duration = 0,
    isPlaying,
    isReducedMotion = false,
    compact = false,
    onTogglePlay
  }: FullScreenVinylStageProps) => {
    const { t } = useTranslation();
    const tonearmRef = useRef<HTMLButtonElement>(null);
    const progressRatioRef = useRef(0);

    // Zero-rerender tonearm groove tracking via player/positionChange DOM event
    useEffect(() => {
      const updateTonearmAngle = (ratio: number) => {
        if (!tonearmRef.current) return;
        const clamped = Math.max(0, Math.min(1, ratio));
        // parked = 0deg; outer groove = 18deg; inner groove = 30deg
        const angle = isPlaying ? 18 + clamped * 12 : 0;
        tonearmRef.current.style.transform = `rotate(${angle.toFixed(2)}deg)`;
      };

      updateTonearmAngle(progressRatioRef.current);

      const handlePosition = (e: Event) => {
        if ('detail' in e && typeof e.detail === 'number' && duration > 0) {
          progressRatioRef.current = e.detail / duration;
          updateTonearmAngle(progressRatioRef.current);
        }
      };

      document.addEventListener('player/positionChange', handlePosition);
      return () => document.removeEventListener('player/positionChange', handlePosition);
    }, [isPlaying, duration]);

    const shouldSpin = isPlaying && !isReducedMotion;

    const platterSizeClass = compact
      ? 'h-56 w-56 xl:h-64 xl:w-64'
      : 'h-72 w-72 sm:h-80 sm:w-80 md:h-96 md:w-96';

    return (
      <div
        data-testid="fullscreen-vinyl-stage"
        className="relative flex items-center justify-center select-none"
      >
        {/* Ambient Turntable Backlight */}
        <div
          className={`pointer-events-none absolute rounded-full bg-black/60 opacity-50 blur-3xl ${platterSizeClass}`}
        />

        <div className="relative flex items-center justify-center">
          {/* Album Sleeve Peek (visible in non-compact Showcase mode) */}
          {!compact && (
            <div
              data-testid="vinyl-album-sleeve"
              className="relative z-10 -mr-20 hidden aspect-square w-56 -rotate-3 overflow-hidden rounded-2xl border border-white/15 shadow-2xl transition-transform duration-500 sm:block md:w-64"
            >
              <Img
                src={artworkPath}
                fallbackSrc={DefaultSongCover}
                loading="eager"
                alt={title || 'Album Sleeve'}
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 bg-linear-to-r from-black/10 via-transparent to-black/50" />
            </div>
          )}

          {/* Spinning 12-inch Grooved Vinyl Record */}
          <div className={`relative z-20 aspect-square ${platterSizeClass}`}>
            {/* Outer Platter Rim */}
            <div className="absolute -inset-1.5 rounded-full border border-white/10 bg-zinc-900/60 shadow-[0_25px_60px_rgba(0,0,0,0.85)] backdrop-blur-xs" />

            {/* Rotating Vinyl Disc */}
            <div
              data-testid="vinyl-spinning-disc"
              data-spinning={shouldSpin ? 'true' : 'false'}
              className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/15 bg-zinc-950 shadow-inner"
              style={{
                backgroundImage: `
                  conic-gradient(from 35deg, transparent 0deg, rgba(255,255,255,0.11) 42deg, transparent 85deg, transparent 180deg, rgba(255,255,255,0.11) 222deg, transparent 265deg),
                  repeating-radial-gradient(circle at center, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1.5px, transparent 4px)
                `,
                animation: isReducedMotion ? 'none' : 'fx-orbit-spin 5.5s linear infinite',
                animationPlayState: shouldSpin ? 'running' : 'paused',
                willChange: shouldSpin ? 'transform' : 'auto'
              }}
            >
              {/* Inner Runout Groove Ring */}
              <div className="pointer-events-none absolute h-[44%] w-[44%] rounded-full border border-white/10 bg-zinc-950/90" />

              {/* Center Record Artwork Label */}
              <div className="relative flex h-[38%] w-[38%] items-center justify-center overflow-hidden rounded-full border-2 border-zinc-900 shadow-lg">
                <Img
                  src={artworkPath}
                  fallbackSrc={DefaultSongCover}
                  loading="eager"
                  alt={title || 'Vinyl Label'}
                  className="h-full w-full object-cover"
                />
                {/* Center Metallic Spindle Hole */}
                <div className="absolute h-3.5 w-3.5 rounded-full border border-white/40 bg-zinc-950 shadow-inner" />
              </div>
            </div>

            {/* Interactive Tonearm Assembly */}
            <button
              ref={tonearmRef}
              type="button"
              data-testid="vinyl-tonearm-btn"
              onClick={onTogglePlay}
              aria-label={
                isPlaying
                  ? t('player.liftTonearmPause', 'Lift tonearm to pause')
                  : t('player.dropTonearmPlay', 'Drop tonearm to play')
              }
              title={
                isPlaying
                  ? t('player.liftTonearmPause', 'Lift tonearm to pause')
                  : t('player.dropTonearmPlay', 'Drop tonearm to play')
              }
              style={{
                transformOrigin: '20px 20px',
                transform: `rotate(${isPlaying ? 18 : 0}deg)`
              }}
              className="group/tonearm absolute -top-2 -right-6 z-30 flex h-44 w-12 cursor-pointer flex-col items-center border-0 bg-transparent p-0 transition-transform duration-500 ease-out focus-visible:outline-none sm:h-52"
            >
              {/* Tonearm Pivot Base */}
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-zinc-800 shadow-xl transition-transform group-hover/tonearm:scale-105">
                <div className="h-4 w-4 rounded-full bg-zinc-400 shadow-inner" />
              </div>
              {/* Tonearm Rod */}
              <div className="h-28 w-1.5 rounded-full bg-linear-to-b from-zinc-300 via-zinc-400 to-zinc-500 shadow-md sm:h-36" />
              {/* Headshell & Stylus Cartridge */}
              <div className="-mt-1 h-6 w-3.5 rotate-12 rounded-xs border border-white/25 bg-zinc-800 shadow-lg">
                <div
                  className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${
                    isPlaying
                      ? 'bg-font-color-highlight shadow-[0_0_8px_currentColor]'
                      : 'bg-white/30'
                  }`}
                />
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }
);

FullScreenVinylStage.displayName = 'FullScreenVinylStage';
export default FullScreenVinylStage;
