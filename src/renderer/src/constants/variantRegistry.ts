import type { CoverLayoutVariant, PlaylistCoverLayout } from '../types/playlistCover';

export interface VariantOption {
  id: CoverLayoutVariant;
  label: string;
  description: string;
}

export const VARIANT_MAP: Record<Exclude<PlaylistCoverLayout, 'grid'>, VariantOption[]> = {
  triangle: [
    { id: 'diagonal', label: 'Diagonal', description: 'Classic corner-to-center diagonal split' },
    { id: 'pinwheel', label: 'Pinwheel', description: 'Rotational pinwheel blades' },
    { id: 'center', label: 'Center', description: 'Centrally focused radial triangles' }
  ],
  fan: [
    { id: 'standard', label: 'Standard', description: 'Balanced vertical fan strips' },
    { id: 'wide', label: 'Wide', description: 'Expansive wide-angle fan strips' },
    { id: 'tight', label: 'Tight', description: 'Dense parallel fan strips' }
  ],
  diamond: [
    { id: 'classic', label: 'Classic', description: 'Harmonious diamond tessellation' },
    { id: 'hero', label: 'Hero', description: 'Prominent central diamond focal tile' },
    { id: 'rotated', label: 'Rotated', description: '45-degree angled diamond matrix' }
  ]
};

export const DEFAULT_VARIANTS: Record<Exclude<PlaylistCoverLayout, 'grid'>, CoverLayoutVariant> = {
  triangle: 'diagonal',
  fan: 'standard',
  diamond: 'classic'
};

export function getAvailableVariants(layout: PlaylistCoverLayout): VariantOption[] {
  if (layout === 'grid') return [];
  return VARIANT_MAP[layout] || [];
}

export function getDefaultVariant(layout: PlaylistCoverLayout): CoverLayoutVariant | undefined {
  if (layout === 'grid') return undefined;
  return DEFAULT_VARIANTS[layout];
}
