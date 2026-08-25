/**
 * Nora Glow FX kit — zero-dependency visual effect primitives.
 *
 * All styles live in `@renderer/assets/styles/fx.css` (imported globally). Every primitive animates
 * compositor-only properties, degrades gracefully without JS/Houdini/reduced-motion, and honors
 * `[data-fx-paused]`.
 */
export { AmbientGlow } from './AmbientGlow';
export type { AmbientGlowProps } from './AmbientGlow';
export { AuroraBackground } from './AuroraBackground';
export type { AuroraBackgroundProps } from './AuroraBackground';
export { BorderBeam } from './BorderBeam';
export type { BorderBeamProps } from './BorderBeam';
export { DotLoader } from './DotLoader';
export type { DotLoaderProps, DotLoaderSize, DotLoaderVariant } from './DotLoader';
export { ShimmerSkeleton } from './ShimmerSkeleton';
export type { ShimmerSkeletonProps } from './ShimmerSkeleton';
export { SpotlightCard } from './SpotlightCard';
export type { SpotlightCardProps } from './SpotlightCard';
