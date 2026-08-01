import type { ClipPathArtworkCount, TriangleStyle } from '../types/playlistCover';

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
  ]
} as const;

export const TRIANGLE_PRESETS: Record<TriangleStyle, Record<ClipPathArtworkCount, readonly string[]>> = {
  diagonal: DIAGONAL_PRESETS,
  pinwheel: DIAGONAL_PRESETS,
  center: DIAGONAL_PRESETS
};
