import { DIAMOND_PRESETS } from '../constants/diamondPresets';
import { FAN_PRESETS } from '../constants/fanPresets';
import { TRIANGLE_PRESETS } from '../constants/trianglePresets';
import type {
  ClipPathArtworkCount,
  CoverLayoutVariant,
  PlaylistCoverLayout
} from '../types/playlistCover';

const GRID_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: ['polygon(0 0, 50% 0, 50% 100%, 0 100%)', 'polygon(50% 0, 100% 0, 100% 100%, 50% 100%)'],
  3: [
    'polygon(0 0, 50% 0, 50% 100%, 0 100%)',
    'polygon(50% 0, 100% 0, 100% 50%, 50% 50%)',
    'polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)'
  ],
  4: [
    'polygon(0 0, 50% 0, 50% 50%, 0 50%)',
    'polygon(50% 0, 100% 0, 100% 50%, 50% 50%)',
    'polygon(0 50%, 50% 50%, 50% 100%, 0 100%)',
    'polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)'
  ],
  5: [
    'polygon(0 0, 50% 0, 50% 50%, 0 50%)',
    'polygon(50% 0, 100% 0, 100% 50%, 50% 50%)',
    'polygon(0 50%, 50% 50%, 50% 100%, 0 100%)',
    'polygon(50% 50%, 100% 50%, 100% 100%, 50% 100%)',
    'polygon(25% 25%, 75% 25%, 75% 75%, 25% 75%)'
  ]
};

export function getLayoutClipPaths(
  layout: PlaylistCoverLayout = 'grid',
  variant?: CoverLayoutVariant,
  count: number = 4
): readonly string[] {
  const validCount = Math.max(2, Math.min(5, count)) as ClipPathArtworkCount;

  if (layout === 'grid') {
    return GRID_PRESETS[validCount] || GRID_PRESETS[4];
  }

  if (layout === 'triangle') {
    const targetVariant = variant && variant in TRIANGLE_PRESETS ? variant : 'diagonal';
    const presets = TRIANGLE_PRESETS[targetVariant as keyof typeof TRIANGLE_PRESETS];
    return presets[validCount] || presets[4];
  }

  if (layout === 'fan') {
    const targetVariant = variant && variant in FAN_PRESETS ? variant : 'standard';
    const presets = FAN_PRESETS[targetVariant as keyof typeof FAN_PRESETS];
    return presets[validCount] || presets[4];
  }

  if (layout === 'diamond') {
    const targetVariant = variant && variant in DIAMOND_PRESETS ? variant : 'classic';
    const presets = DIAMOND_PRESETS[targetVariant as keyof typeof DIAMOND_PRESETS];
    return presets[validCount] || presets[4];
  }

  return GRID_PRESETS[4];
}
