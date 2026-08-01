export type PlaylistCoverLayout = 'grid' | 'triangle' | 'fan' | 'diamond';

export const COVER_IMAGE_COUNTS = [1, 2, 3, 4] as const;

export interface PlaylistCoverSettings {
  type: 'auto' | 'collage';
  collage?: {
    layout: PlaylistCoverLayout;
    size: 1 | 2 | 3 | 4;
    songIds: number[];
  };
}

export interface ResolvedPlaylistCover {
  layout: PlaylistCoverLayout;
  artworks: string[];
}

export type TriangleStyle = 'diagonal' | 'pinwheel' | 'center';
export type CoverLayoutStyle = TriangleStyle | undefined;

export interface CoverRendererProps {
  artworks: string[];
  layout: PlaylistCoverLayout;
  style?: CoverLayoutStyle;
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
