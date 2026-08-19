export interface CanonicalTrackIdentity {
  id?: string | number;
  title: string;
  artists: string[];
  album?: string;
  albumArtist?: string;
  durationSecs?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  releaseYear?: number;
  trackNumber?: number;
  discNumber?: number;
  genre?: string;
  pathOrUri?: string;
}
