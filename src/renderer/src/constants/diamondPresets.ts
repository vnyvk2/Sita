import type { ClipPathArtworkCount, DiamondStyle, LayoutPreset } from '../types/playlistCover';

const CLASSIC_DIAMOND_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(50% 0, 100% 0, 50% 100%, 0 100%)',
    'polygon(0 0, 50% 0, 100% 100%, 50% 100%)'
  ],
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

export const DIAMOND_PRESETS: LayoutPreset<DiamondStyle> = {
  classic: CLASSIC_DIAMOND_PRESETS
};
