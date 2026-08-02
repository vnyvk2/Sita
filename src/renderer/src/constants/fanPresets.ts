import type { ClipPathArtworkCount, FanVariant, LayoutPreset } from '../types/playlistCover';

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
  ],
  5: [
    'polygon(0 0, 35% 0, 15% 100%, 0 100%)',
    'polygon(35% 0, 60% 0, 40% 100%, 15% 100%)',
    'polygon(60% 0, 85% 0, 65% 100%, 40% 100%)',
    'polygon(85% 0, 100% 0, 100% 100%, 65% 100%)',
    'polygon(50% 25%, 75% 50%, 50% 75%, 25% 50%)'
  ]
} as const;

const WIDE_FAN_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 85% 0, 15% 100%, 0 100%)',
    'polygon(85% 0, 100% 0, 100% 100%, 15% 100%)'
  ],
  3: [
    'polygon(0 0, 60% 0, 10% 100%, 0 100%)',
    'polygon(60% 0, 90% 0, 45% 100%, 10% 100%)',
    'polygon(90% 0, 100% 0, 100% 100%, 45% 100%)'
  ],
  4: [
    'polygon(0 0, 45% 0, 5% 100%, 0 100%)',
    'polygon(45% 0, 75% 0, 30% 100%, 5% 100%)',
    'polygon(75% 0, 95% 0, 60% 100%, 30% 100%)',
    'polygon(95% 0, 100% 0, 100% 100%, 60% 100%)'
  ],
  5: [
    'polygon(0 0, 45% 0, 5% 100%, 0 100%)',
    'polygon(45% 0, 75% 0, 30% 100%, 5% 100%)',
    'polygon(75% 0, 95% 0, 60% 100%, 30% 100%)',
    'polygon(95% 0, 100% 0, 100% 100%, 60% 100%)',
    'polygon(50% 25%, 75% 50%, 50% 75%, 25% 50%)'
  ]
} as const;

const TIGHT_FAN_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 55% 0, 45% 100%, 0 100%)',
    'polygon(55% 0, 100% 0, 100% 100%, 45% 100%)'
  ],
  3: [
    'polygon(0 0, 36% 0, 30% 100%, 0 100%)',
    'polygon(36% 0, 68% 0, 62% 100%, 30% 100%)',
    'polygon(68% 0, 100% 0, 100% 100%, 62% 100%)'
  ],
  4: [
    'polygon(0 0, 27% 0, 23% 100%, 0 100%)',
    'polygon(27% 0, 52% 0, 48% 100%, 23% 100%)',
    'polygon(52% 0, 77% 0, 73% 100%, 48% 100%)',
    'polygon(77% 0, 100% 0, 100% 100%, 73% 100%)'
  ],
  5: [
    'polygon(0 0, 27% 0, 23% 100%, 0 100%)',
    'polygon(27% 0, 52% 0, 48% 100%, 23% 100%)',
    'polygon(52% 0, 77% 0, 73% 100%, 48% 100%)',
    'polygon(77% 0, 100% 0, 100% 100%, 73% 100%)',
    'polygon(50% 25%, 75% 50%, 50% 75%, 25% 50%)'
  ]
} as const;

export const FAN_PRESETS: LayoutPreset<FanVariant> = {
  standard: STANDARD_FAN_PRESETS,
  wide: WIDE_FAN_PRESETS,
  tight: TIGHT_FAN_PRESETS
};
