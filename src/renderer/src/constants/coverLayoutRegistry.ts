import type { CoverLayoutDefinition } from '../types/playlistCover';

export const COVER_LAYOUT_DEFINITIONS: CoverLayoutDefinition[] = [
  {
    id: 'grid',
    title: 'Grid Collage',
    description: 'Classic 1, 2, 3, or 4 quadrant cover grid',
    icon: 'grid_view',
    enabled: true,
    minImages: 1,
    maxImages: 4,
  },
  {
    id: 'triangle',
    title: 'Triangle Split',
    description: 'Diagonal split geometric collage',
    icon: 'change_history',
    enabled: true,
    minImages: 1,
    maxImages: 4,
  },
  {
    id: 'fan',
    title: 'Fan Stack',
    description: 'Layered angled card fan stack',
    icon: 'style',
    enabled: true,
    minImages: 1,
    maxImages: 4,
  },
  {
    id: 'diamond',
    title: 'Diamond Rotation',
    description: 'Rotated diamond center focus',
    icon: 'diamond',
    enabled: true,
    minImages: 1,
    maxImages: 5,
  },
];
