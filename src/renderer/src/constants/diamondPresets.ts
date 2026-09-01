import type { ClipPathArtworkCount, DiamondVariant, LayoutPreset } from '../types/playlistCover';

const CLASSIC_DIAMOND_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: ['polygon(50% 0, 100% 0, 50% 100%, 0 100%)', 'polygon(0 0, 50% 0, 100% 100%, 50% 100%)'],
  3: [
    'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    'polygon(0 0, 100% 0, 50% 0, 0 50%, 0 0)',
    'polygon(100% 50%, 100% 100%, 0 100%, 50% 100%)'
  ],
  4: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(100% 0, 100% 100%, 50% 50%)',
    'polygon(0 100%, 100% 100%, 50% 50%)',
    'polygon(0 0, 0 100%, 50% 50%)'
  ],
  5: [
    'polygon(0 0, 100% 0, 75% 50%, 50% 25%)',
    'polygon(100% 0, 100% 100%, 50% 75%, 75% 50%)',
    'polygon(100% 100%, 0 100%, 25% 50%, 50% 75%)',
    'polygon(0 100%, 0 0, 50% 25%, 25% 50%)',
    'polygon(50% 25%, 75% 50%, 50% 75%, 25% 50%)'
  ]
} as const;

const HERO_DIAMOND_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: ['polygon(50% 10%, 90% 50%, 50% 90%, 10% 50%)', 'polygon(0 0, 100% 0, 100% 100%, 0 100%)'],
  3: [
    'polygon(50% 15%, 85% 50%, 50% 85%, 15% 50%)',
    'polygon(0 0, 100% 0, 100% 45%, 0 45%)',
    'polygon(0 55%, 100% 55%, 100% 100%, 0 100%)'
  ],
  4: [
    'polygon(50% 20%, 80% 50%, 50% 80%, 20% 50%)',
    'polygon(0 0, 100% 0, 50% 20%)',
    'polygon(100% 0, 100% 100%, 80% 50%)',
    'polygon(0 100%, 100% 100%, 50% 80%)'
  ],
  5: [
    'polygon(50% 15%, 85% 50%, 50% 85%, 15% 50%)',
    'polygon(0 0, 100% 0, 85% 50%, 50% 15%)',
    'polygon(100% 0, 100% 100%, 50% 85%, 85% 50%)',
    'polygon(100% 100%, 0 100%, 15% 50%, 50% 85%)',
    'polygon(0 100%, 0 0, 50% 15%, 15% 50%)'
  ]
} as const;

const ROTATED_DIAMOND_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: ['polygon(50% 0, 100% 50%, 50% 100%, 0 50%)', 'polygon(0 0, 100% 0, 100% 100%, 0 100%)'],
  3: [
    'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    'polygon(0 0, 100% 0, 50% 0, 0 50%)',
    'polygon(100% 50%, 100% 100%, 0 100%, 50% 100%)'
  ],
  4: [
    'polygon(50% 0, 100% 0, 50% 50%)',
    'polygon(100% 0, 100% 100%, 50% 50%)',
    'polygon(0 100%, 100% 100%, 50% 50%)',
    'polygon(0 0, 0 100%, 50% 50%)'
  ],
  5: [
    'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)',
    'polygon(0 0, 50% 0, 0 50%)',
    'polygon(50% 0, 100% 0, 100% 50%)',
    'polygon(100% 50%, 100% 100%, 50% 100%)',
    'polygon(0 50%, 50% 100%, 0 100%)'
  ]
} as const;

export const DIAMOND_PRESETS: LayoutPreset<DiamondVariant> = {
  classic: CLASSIC_DIAMOND_PRESETS,
  hero: HERO_DIAMOND_PRESETS,
  rotated: ROTATED_DIAMOND_PRESETS
};
