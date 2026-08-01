import type { ClipPathArtworkCount } from '../types/playlistCover';

export type FanStyle = 'standard';

const STANDARD_FAN_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 70% 0, 30% 100%, 0 100%)',
    'polygon(70% 0, 100% 0, 100% 100%, 30% 100%)'
  ],
  3: [
    'polygon(0 0, 45% 0, 20% 100%, 0 100%)',
    'polygon(45% 0, 75% 0, 55% 100%, 20% 100%)',
    'polygon(75% 0, 100% 0, 100% 100%, 55% 100%)'
  ],
  4: [
    'polygon(0 0, 35% 0, 15% 100%, 0 100%)',
    'polygon(35% 0, 60% 0, 40% 100%, 15% 100%)',
    'polygon(60% 0, 85% 0, 65% 100%, 40% 100%)',
    'polygon(85% 0, 100% 0, 100% 100%, 65% 100%)'
  ]
} as const;

export const FAN_PRESETS: Record<FanStyle, Record<ClipPathArtworkCount, readonly string[]>> = {
  standard: STANDARD_FAN_PRESETS
};
