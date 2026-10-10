import { memo, useEffect, useMemo, useRef, useState } from 'react';

import DefaultSongCover from '../../../assets/images/webp/song_cover_default.webp';
import AuroraBackground from '../../fx/AuroraBackground';
import ParticlesLayer from '../../fx/ParticlesLayer';
import Img from '../../Img';

interface FullScreenLiquidBackdropProps {
  artworkPath?: string;
  paletteData?: PaletteData;
  isPlaying: boolean;
  isReducedMotion: boolean;
  isSystemPaused: boolean;
  isAmbientParticlesEnabled: boolean;
}

export const FullScreenLiquidBackdrop = memo(
  ({
    artworkPath,
    paletteData,
    isPlaying,
    isReducedMotion,
    isSystemPaused,
    isAmbientParticlesEnabled
  }: FullScreenLiquidBackdropProps) => {
    const prevArtworkRef = useRef(artworkPath);
    const [currentArtwork, setCurrentArtwork] = useState<string | undefined>(artworkPath);
    const [previousArtwork, setPreviousArtwork] = useState<string | undefined>(undefined);
    const [fadeOpacity, setFadeOpacity] = useState(1);

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

    // Compute palette-based adaptive darkness using swatch HSL lightness
    const luminance = useMemo(() => {
      if (paletteData?.Vibrant?.hsl) return paletteData.Vibrant.hsl[2];
      if (paletteData?.LightVibrant?.hsl) return paletteData.LightVibrant.hsl[2];
      if (paletteData?.DarkVibrant?.hsl) return paletteData.DarkVibrant.hsl[2];
      if (paletteData?.Muted?.hsl) return paletteData.Muted.hsl[2];
      return 0.5;
    }, [paletteData]);

    // Adaptive dark veil: darker on bright album covers so white text & controls stay legible
    const overlayOpacity = useMemo(() => {
      const baseDarkness = 0.52;
      const luminanceAdjustment = luminance > 0.45 ? (luminance - 0.45) * 0.35 : 0;
      return Math.min(0.82, Math.max(0.42, baseDarkness + luminanceAdjustment));
    }, [luminance]);

    const shouldAnimate = isPlaying && !isReducedMotion && !isSystemPaused;

    return (
      <div
        data-testid="fullscreen-liquid-backdrop"
        aria-hidden="true"
        className="background-cover-img-container pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
      >
        {/* Static-filter blurred container: inner layers only animate compositor transforms */}
        <div
          className={`absolute -inset-[60px] overflow-hidden ${
            shouldAnimate ? 'animate-ambient-drift' : ''
          }`}
          style={{
            filter: 'blur(42px) saturate(1.45) brightness(0.85)',
            transform: 'translate3d(0, 0, 0) scale(1.12)',
            contain: 'strict',
            willChange: shouldAnimate ? 'transform' : 'auto'
          }}
        >
          {/* Previous artwork crossfade buffer */}
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

          {/* Active Multi-Layer Liquid Artwork Mesh */}
          <div
            className="absolute inset-0 h-full w-full transition-opacity duration-800 ease-in-out"
            style={{ opacity: fadeOpacity }}
          >
            {/* Layer 1: Full-bleed base wash */}
            <Img
              src={currentArtwork}
              fallbackSrc={DefaultSongCover}
              loading="eager"
              alt="Song Cover"
              className="h-full w-full object-cover"
            />

            {/* Layer 2: Upper-left clockwise rotating color lobe */}
            <div
              data-testid="liquid-mesh-lobe-primary"
              className=" absolute -top-1/4 -left-1/4 h-[90%] w-[90%] overflow-hidden rounded-full opacity-55 mix-blend-screen"
              style={{
                animation: isReducedMotion ? 'none' : 'fx-orbit-spin 38s linear infinite',
                animationPlayState: shouldAnimate ? 'running' : 'paused',
                willChange: shouldAnimate ? 'transform' : 'auto'
              }}
            >
              <Img
                src={currentArtwork}
                fallbackSrc={DefaultSongCover}
                loading="eager"
                alt=""
                className="h-full w-full scale-150 object-cover"
              />
            </div>

            {/* Layer 3: Lower-right counter-clockwise rotating color lobe */}
            <div
              data-testid="liquid-mesh-lobe-secondary"
              className="absolute -right-1/4 -bottom-1/4 h-[85%] w-[85%] overflow-hidden rounded-full opacity-45 mix-blend-overlay"
              style={{
                animation: isReducedMotion ? 'none' : 'fx-orbit-spin 46s linear infinite reverse',
                animationPlayState: shouldAnimate ? 'running' : 'paused',
                willChange: shouldAnimate ? 'transform' : 'auto'
              }}
            >
              <Img
                src={currentArtwork}
                fallbackSrc={DefaultSongCover}
                loading="eager"
                alt=""
                className="h-full w-full scale-150 object-cover"
              />
            </div>
          </div>
        </div>

        {/* Adaptive Luminance Readability Veil */}
        <div
          className="absolute inset-0 z-1 transition-colors duration-500 ease-in-out"
          style={{
            backgroundColor: `rgba(8, 8, 12, ${overlayOpacity})`
          }}
        />

        {/* Subtle Radial Cinema Vignette */}
        <div className="absolute inset-0 z-2 bg-radial-[circle_at_center,transparent_0%,rgba(0,0,0,0.55)_100%]" />

        {/* Theme Aurora Wash */}
        <AuroraBackground
          animated={shouldAnimate}
          intensity={0.35}
          colors={['var(--fx-accent)', 'var(--fx-accent-third)', 'var(--fx-accent-alt)']}
        />

        {/* Opt-in Ambient Dust Particles */}
        {isAmbientParticlesEnabled && (
          <ParticlesLayer isActive={isPlaying} isSystemPaused={isSystemPaused || isReducedMotion} />
        )}
      </div>
    );
  }
);

FullScreenLiquidBackdrop.displayName = 'FullScreenLiquidBackdrop';
export default FullScreenLiquidBackdrop;
