import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export interface SpotifyTrackInput {
  id?: string;
  uri?: string;
  name: string;
  artists?: Array<{ name: string; id?: string }>;
  album?: {
    name?: string;
    release_date?: string;
  };
  duration_ms?: number;
  track_number?: number;
  disc_number?: number;
  external_ids?: {
    isrc?: string;
    ean?: string;
    upc?: string;
  };
}

export function toCanonicalFromSpotifyTrack(track: SpotifyTrackInput): CanonicalTrackIdentity {
  const artists: string[] = [];
  if (Array.isArray(track.artists)) {
    for (const a of track.artists) {
      if (a && typeof a.name === 'string') {
        const trimmed = a.name.trim();
        if (trimmed) artists.push(trimmed);
      }
    }
  }

  let releaseYear: number | undefined;
  if (track.album?.release_date) {
    const yearMatch = track.album.release_date.match(/^(\d{4})/);
    if (yearMatch) {
      releaseYear = parseInt(yearMatch[1], 10);
    }
  }

  const durationSecs =
    typeof track.duration_ms === 'number'
      ? Math.round((track.duration_ms / 1000) * 1000) / 1000
      : undefined;

  return {
    id: track.id,
    title: track.name,
    artists,
    album: track.album?.name?.trim() || undefined,
    durationSecs,
    isrc: track.external_ids?.isrc?.trim() || undefined,
    releaseYear,
    trackNumber: track.track_number,
    discNumber: track.disc_number,
    pathOrUri: track.uri ?? (track.id ? `spotify:track:${track.id}` : undefined)
  };
}
