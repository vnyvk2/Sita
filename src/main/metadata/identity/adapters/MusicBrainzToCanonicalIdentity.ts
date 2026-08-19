import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export interface MusicBrainzTrackInput {
  id?: string;
  recordingId?: string;
  title: string;
  artist?: string;
  artists?: string[];
  album?: string;
  duration?: number;
  durationMs?: number;
  trackNumber?: number;
  discNumber?: number;
  isrc?: string;
  year?: number;
}

export function toCanonicalFromMusicBrainz(track: MusicBrainzTrackInput): CanonicalTrackIdentity {
  const artists: string[] = [];
  if (Array.isArray(track.artists)) {
    for (const a of track.artists) {
      if (a && typeof a === 'string') {
        const trimmed = a.trim();
        if (trimmed) artists.push(trimmed);
      }
    }
  } else if (typeof track.artist === 'string') {
    const trimmed = track.artist.trim();
    if (trimmed) artists.push(trimmed);
  }

  const durationSecs =
    track.duration !== undefined
      ? track.duration
      : typeof track.durationMs === 'number'
        ? track.durationMs / 1000
        : undefined;

  return {
    id: track.id ?? track.recordingId,
    title: track.title,
    artists,
    album: track.album?.trim() || undefined,
    durationSecs,
    isrc: track.isrc?.trim() || undefined,
    musicBrainzRecordingId: (track.recordingId ?? track.id)?.trim() || undefined,
    releaseYear: track.year,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber
  };
}
