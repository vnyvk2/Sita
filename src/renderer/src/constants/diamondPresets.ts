import type { ClipPathArtworkCount, DiamondStyle } from '../types/playlistCover';

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
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(100% 0, 100% 100%, 50% 50%)',
    'polygon(0 100%, 100% 100%, 50% 50%)',
    'polygon(0 0, 0 100%, 50% 50%)',
    'polygon(50% 20%, 80% 50%, 50% 80%, 20% 50%)'
  ]
} as const;

export const DIAMOND_PRESETS: Record<DiamondStyle, Record<ClipPathArtworkCount, readonly string[]>> = {
  classic: CLASSIC_DIAMOND_PRESETS
};
