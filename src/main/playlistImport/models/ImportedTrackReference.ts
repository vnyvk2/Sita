export interface ImportedTrackReference {
  originalLocation: string;
  originalUri?: string;
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  duration?: number;
  trackNumber?: number;
  discNumber?: number;
  fileSize?: number;
  hash?: string;
}
