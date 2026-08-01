export type PlaylistCoverLayout = 'grid' | 'triangle' | 'fan' | 'diamond';

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

export interface CoverRendererProps {
  artworks: string[];
  layout: PlaylistCoverLayout;
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
