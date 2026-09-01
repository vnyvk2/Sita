export type PlaylistCoverLayout = 'grid' | 'triangle' | 'fan' | 'diamond';

export const COVER_IMAGE_COUNTS = [1, 2, 3, 4, 5] as const;

export type AutoCoverStrategyId = 'firstN' | 'mostPlayed' | 'recentlyAdded' | 'random';

export interface PlaylistCoverSettings {
  version?: number;
  type: 'auto' | 'collage';
  autoStrategy?: AutoCoverStrategyId;
  collage?: {
    layout: PlaylistCoverLayout;
    variant?: CoverLayoutVariant;
    size: 1 | 2 | 3 | 4 | 5;
    songIds: number[];
  };
}

export interface ResolvedPlaylistCover {
  layout: PlaylistCoverLayout;
  variant?: CoverLayoutVariant;
  artworks: string[];
}

export type ClipPathArtworkCount = 2 | 3 | 4 | 5;
export type TriangleVariant = 'diagonal' | 'pinwheel' | 'center';
export type FanVariant = 'standard' | 'wide' | 'tight';
export type DiamondVariant = 'classic' | 'hero' | 'rotated';
export type CoverLayoutVariant = TriangleVariant | FanVariant | DiamondVariant;

/** @deprecated Use TriangleVariant instead */
export type TriangleStyle = TriangleVariant;
/** @deprecated Use FanVariant instead */
export type FanStyle = FanVariant;
/** @deprecated Use DiamondVariant instead */
export type DiamondStyle = DiamondVariant;
/** @deprecated Use CoverLayoutVariant instead */
export type CoverLayoutStyle = CoverLayoutVariant | undefined;

export type CoverSlotIndex = 0 | 1 | 2 | 3 | 4;

export interface ActiveSlot {
  index: CoverSlotIndex;
}

export type CoverSlotState = 'normal' | 'fallback' | 'missing';

export interface EffectiveCoverSlot {
  slot: CoverSlotIndex;
  song?: SongData;
  state: CoverSlotState;
  editable: boolean;
  draggable: boolean;
}

export type LayoutPreset<S extends string> = Record<
  S,
  Record<ClipPathArtworkCount, readonly string[]>
>;

export interface CoverRendererProps {
  artworks: string[];
  layout: PlaylistCoverLayout;
  requestedCount?: number;
  variant?: CoverLayoutVariant;
  className?: string;
  enableImgFadeIns?: boolean;
}

export interface CoverLayoutDefinition {
  id: PlaylistCoverLayout;
  title: string;
  description: string;
  icon: string;
  enabled: boolean;
  minImages: number;
  maxImages: number;
}

export interface PlaylistCoverDraft {
  originalSettings: PlaylistCoverSettings;
  currentSettings: PlaylistCoverSettings;
  workingSongs: SongData[];
}
