import type { ClipPathArtworkCount, LayoutPreset, TriangleVariant } from '../types/playlistCover';

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

const PINWHEEL_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(100% 100%, 0 100%, 50% 50%)'
  ],
  3: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(100% 0, 100% 100%, 50% 50%)',
    'polygon(0 0, 0 100%, 100% 100%, 50% 50%)'
  ],
  4: [
    'polygon(0 0, 100% 0, 50% 50%)',
    'polygon(100% 0, 100% 100%, 50% 50%)',
    'polygon(100% 100%, 0 100%, 50% 50%)',
    'polygon(0 100%, 0 0, 50% 50%)'
  ],
  5: [
    'polygon(0 0, 100% 0, 50% 25%)',
    'polygon(100% 0, 100% 100%, 75% 50%)',
    'polygon(100% 100%, 0 100%, 50% 75%)',
    'polygon(0 100%, 0 0, 25% 50%)',
    'polygon(50% 25%, 75% 50%, 50% 75%, 25% 50%)'
  ]
} as const;

const CENTER_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 100% 0, 50% 100%)',
    'polygon(0 100%, 100% 100%, 50% 0)'
  ],
  3: [
    'polygon(0 0, 100% 0, 50% 60%)',
    'polygon(0 0, 50% 60%, 0 100%)',
    'polygon(100% 0, 100% 100%, 0 100%, 50% 60%)'
  ],
  4: [
    'polygon(25% 25%, 75% 25%, 50% 50%)',
    'polygon(0 0, 100% 0, 75% 25%, 25% 25%)',
    'polygon(0 0, 25% 25%, 50% 50%, 0 100%)',
    'polygon(100% 0, 100% 100%, 0 100%, 50% 50%, 75% 25%)'
  ],
  5: [
    'polygon(25% 25%, 75% 25%, 50% 75%)',
    'polygon(0 0, 100% 0, 75% 25%, 25% 25%)',
    'polygon(100% 0, 100% 100%, 75% 25%)',
    'polygon(0 100%, 100% 100%, 50% 75%)',
    'polygon(0 0, 0 100%, 25% 25%)'
  ]
} as const;

export const TRIANGLE_PRESETS: LayoutPreset<TriangleVariant> = {
  diagonal: DIAGONAL_PRESETS,
  pinwheel: PINWHEEL_PRESETS,
  center: CENTER_PRESETS
};
