export type RecordingVariant =
  | 'STUDIO'
  | 'LIVE'
  | 'ACOUSTIC'
  | 'REMIX'
  | 'INSTRUMENTAL'
  | 'DELUXE'
  | 'RADIO_EDIT'
  | 'DEMO'
  | 'EXTENDED'
  | (string & {});

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
  recordingVariant?: RecordingVariant;
}
