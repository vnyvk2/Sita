import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { memo, useEffect, useMemo, useRef, useState } from 'react';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import Img from '../Img';

interface LyricsAmbientBackgroundProps {
  artworkPath?: string;
  paletteData?: PaletteData;
  className?: string;
}

const getLuminance = (rgb?: [number, number, number] | number[]): number => {
  if (!rgb || rgb.length < 3) return 0.5;
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

const LyricsAmbientBackground = ({
  artworkPath,
  paletteData,
  className
}: LyricsAmbientBackgroundProps) => {
  const lyricsArtworkBlur = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsArtworkBlur ?? 40
  );
  const lyricsArtworkDarkness = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsArtworkDarkness ?? 50
  );
  const lyricsArtworkAnimation = useStore(
    store,
    (state) => state.localStorage.preferences?.lyricsArtworkAnimation ?? true
  );
  const isReducedMotion = useStore(
    store,
    (state) =>
      state.localStorage.preferences?.isReducedMotion ||
      (state.isOnBatteryPower && state.localStorage.preferences?.removeAnimationsOnBatteryPower)
  );
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);

  const prevArtworkRef = useRef(artworkPath);
  const [currentArtwork, setCurrentArtwork] = useState<string | undefined>(artworkPath);
  const [previousArtwork, setPreviousArtwork] = useState<string | undefined>(undefined);
  const [fadeOpacity, setFadeOpacity] = useState(1);

  // Double-buffered crossfade on artwork change
  useEffect(() => {
    if (artworkPath !== prevArtworkRef.current) {
      const oldArtwork = prevArtworkRef.current;
      prevArtworkRef.current = artworkPath;

      setPreviousArtwork(oldArtwork);
      setCurrentArtwork(artworkPath);
      setFadeOpacity(0);

      const raf = requestAnimationFrame(() => {
        setFadeOpacity(1);
      });

      const timer = setTimeout(() => {
        setPreviousArtwork(undefined);
      }, 850);

      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
      };
    }
    return undefined;
  }, [artworkPath]);

  // Compute palette-based adaptive darkness
  const luminance = useMemo(() => {
    if (paletteData?.Vibrant?.rgb) return getLuminance(paletteData.Vibrant.rgb);
    if (paletteData?.LightVibrant?.rgb) return getLuminance(paletteData.LightVibrant.rgb);
    if (paletteData?.DarkVibrant?.rgb) return getLuminance(paletteData.DarkVibrant.rgb);
    if (paletteData?.Muted?.rgb) return getLuminance(paletteData.Muted.rgb);
    return 0.5;
  }, [paletteData]);

  // Adaptive dark overlay calculation for readability enhancement
  const overlayOpacity = useMemo(() => {
    const baseDarkness = Math.min(Math.max(lyricsArtworkDarkness, 20), 80) / 100;
    // For high-luminance covers, add gentle boost (up to +12%) to enhance text readability
    const luminanceAdjustment = luminance > 0.45 ? (luminance - 0.45) * 0.25 : 0;
    return Math.min(0.88, Math.max(0.2, baseDarkness + luminanceAdjustment));
  }, [lyricsArtworkDarkness, luminance]);

  const shouldAnimate = lyricsArtworkAnimation && !isReducedMotion && isCurrentSongPlaying;

  return (
    <div
      aria-hidden="true"
      className={`lyrics-ambient-background pointer-events-none absolute inset-0 z-0 select-none overflow-hidden ${
        className ?? ''
      }`}
    >
      {/* Blurred Artwork Layer with negative bleed to prevent blur edge clipping */}
      <div
        className={`absolute -inset-[50px] overflow-hidden ${
          shouldAnimate ? 'animate-ambient-drift' : ''
        }`}
        style={{
          filter: `blur(${lyricsArtworkBlur}px) saturate(1.35) brightness(0.95)`,
          transform: 'translate3d(0, 0, 0) scale(1.15)',
          willChange: shouldAnimate ? 'transform' : 'auto'
        }}
      >
        {/* Previous artwork layer underneath during crossfade */}
        {previousArtwork && (
          <div className="absolute inset-0 h-full w-full">
            <Img
              src={previousArtwork}
              fallbackSrc={DefaultSongCover}
              loading="eager"
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        )}

        {/* Current active artwork layer transitioning in on top */}
        <div
          className="absolute inset-0 h-full w-full transition-opacity duration-800 ease-in-out"
          style={{ opacity: fadeOpacity }}
        >
          <Img
            src={currentArtwork}
            fallbackSrc={DefaultSongCover}
            loading="eager"
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      </div>

      {/* Adaptive Darkness Overlay */}
      <div
        className="absolute inset-0 z-1 transition-colors duration-500 ease-in-out"
        style={{
          backgroundColor: `rgba(0, 0, 0, ${overlayOpacity})`
        }}
      />

      {/* Subtle Radial Vignette Layer for focused depth */}
      <div className="absolute inset-0 z-2 bg-radial-[circle_at_center,transparent_0%,rgba(0,0,0,0.45)_100%]" />
    </div>
  );
};

export default memo(LyricsAmbientBackground);
