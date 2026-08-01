export type PlaylistCoverLayout = 'grid';

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
