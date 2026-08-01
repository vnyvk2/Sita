import type { ClipPathArtworkCount, LayoutPreset, TriangleStyle } from '../types/playlistCover';

const DIAGONAL_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 100% 0, 0 100%)',
    'polygon(100% 0, 100% 100%, 0 100%)'
  ],
  3: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(0 0, 50% 50%, 0 100%)',
    'polygon(100% 0, 100% 100%, 0 100%, 50% 50%)'
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
    'polygon(50% 25%, 75% 50%, 50% 75%, 25% 50%)'
  ]
} as const;

export const TRIANGLE_PRESETS: LayoutPreset<TriangleStyle> = {
  diagonal: DIAGONAL_PRESETS,
  pinwheel: DIAGONAL_PRESETS,
  center: DIAGONAL_PRESETS
};
