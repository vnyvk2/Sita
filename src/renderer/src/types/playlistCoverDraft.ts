import type { AutoCoverStrategyId, CoverLayoutVariant, PlaylistCoverLayout } from './playlistCover';

export interface CoverSlotAssignment {
  songId: number | null;
}

export interface MaterializedCoverDraft {
  version: number;
  type: 'auto' | 'collage';
  autoStrategy: AutoCoverStrategyId;
  layout: PlaylistCoverLayout;
  variant?: CoverLayoutVariant;
  size: 1 | 2 | 3 | 4 | 5;
  slots: CoverSlotAssignment[];
}
