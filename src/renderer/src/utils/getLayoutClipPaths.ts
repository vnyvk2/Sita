import { DIAMOND_PRESETS } from '../constants/diamondPresets';
import { FAN_PRESETS } from '../constants/fanPresets';
import { TRIANGLE_PRESETS } from '../constants/trianglePresets';
import type { ClipPathArtworkCount, CoverLayoutStyle, PlaylistCoverLayout } from '../types/playlistCover';

const GRID_PRESETS: Record<ClipPathArtworkCount, readonly string[]> = {
  2: [
    'polygon(0 0, 100% 0, 100% 50%, 0 50%)',
    'polygon(0 50%, 100% 50%, 100% 100%, 0 100%)'
  ],
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
  style?: CoverLayoutStyle,
  count: number = 4
): readonly string[] {
  const validCount = (Math.max(2, Math.min(5, count)) as ClipPathArtworkCount);

  if (layout === 'grid') {
    return GRID_PRESETS[validCount] || GRID_PRESETS[4];
  }

  if (layout === 'triangle') {
    const targetStyle = style && style in TRIANGLE_PRESETS ? style : 'diagonal';
    const presets = TRIANGLE_PRESETS[targetStyle as keyof typeof TRIANGLE_PRESETS];
    return presets[validCount] || presets[4];
  }

  if (layout === 'fan') {
    const targetStyle = style && style in FAN_PRESETS ? style : 'standard';
    const presets = FAN_PRESETS[targetStyle as keyof typeof FAN_PRESETS];
    return presets[validCount] || presets[4];
  }

  if (layout === 'diamond') {
    const targetStyle = style && style in DIAMOND_PRESETS ? style : 'classic';
    const presets = DIAMOND_PRESETS[targetStyle as keyof typeof DIAMOND_PRESETS];
    return presets[validCount] || presets[4];
  }

  return GRID_PRESETS[4];
}
