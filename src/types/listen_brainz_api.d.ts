export interface ListenBrainzTrackMetadata {
  artist_name: string;
  track_name: string;
  release_name?: string;
  additional_info?: {
    media_player?: string;
    submission_client?: string;
    submission_client_version?: string;
    duration_ms?: number;
    tracknumber?: number;
    musicbrainz_track_id?: string;
    musicbrainz_recording_id?: string;
    musicbrainz_artist_ids?: string[];
    musicbrainz_release_group_id?: string;
    [key: string]: unknown;
  };
}

export interface ListenBrainzListen {
  listened_at?: number;
  track_metadata: ListenBrainzTrackMetadata;
}

export interface ListenBrainzSubmitListensPayload {
  listen_type: 'single' | 'playing_now' | 'import';
  payload: ListenBrainzListen[];
}

export interface ListenBrainzValidateTokenResponse {
  code: number;
  message: string;
  valid: boolean;
  user_name?: string;
}

export interface ListenBrainzSubmitListensResponse {
  status: string;
  code?: number;
  error?: string;
}

export interface ListenBrainzFeedbackPayload {
  recording_mbid?: string;
  recording_msid?: string;
  score: 1 | 0 | -1;
}

export interface ListenBrainzFeedbackResponse {
  status: string;
  code?: number;
  error?: string;
}

export interface ListenBrainzLookupMetadata {
  recording_name?: string;
  artist_name?: string;
  release_name?: string;
  recording_mbid?: string;
  artist_mbids?: string[];
  release_mbid?: string;
  score?: number;
}

export interface ListenBrainzLookupResponse {
  metadata?: ListenBrainzLookupMetadata;
  recordings?: ListenBrainzLookupMetadata[];
}
