import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export interface MusicBrainzTrackInput {
  id?: string;
  recordingId?: string;
  title: string;
  artist?: string;
  artists?: string[];
  artistCredit?: Array<{ name?: string; artist?: { name?: string } } | string>;
  'artist-credit'?: Array<{ name?: string; artist?: { name?: string } } | string>;
  album?: string;
  releases?: Array<{ title?: string; date?: string }>;
  duration?: number;
  durationMs?: number;
  length?: number; // MusicBrainz API standard length in ms
  trackNumber?: number;
  discNumber?: number;
  isrc?: string;
  isrcs?: string[];
  year?: number;
}

export function toCanonicalFromMusicBrainz(track: MusicBrainzTrackInput): CanonicalTrackIdentity {
  const artists: string[] = [];

  const credits = track.artistCredit ?? track['artist-credit'];
  if (Array.isArray(credits)) {
    for (const c of credits) {
      if (typeof c === 'string') {
        const trimmed = c.trim();
        if (trimmed) artists.push(trimmed);
      } else if (c && typeof c.name === 'string') {
        const trimmed = c.name.trim();
        if (trimmed) artists.push(trimmed);
      } else if (c && c.artist && typeof c.artist.name === 'string') {
        const trimmed = c.artist.name.trim();
        if (trimmed) artists.push(trimmed);
      }
    }
  } else if (Array.isArray(track.artists)) {
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

  let album = track.album?.trim() || undefined;
  let releaseYear = track.year;

  if (Array.isArray(track.releases) && track.releases.length > 0) {
    const primaryRelease = track.releases[0];
    if (!album && primaryRelease.title) {
      album = primaryRelease.title.trim();
    }
    if (releaseYear === undefined && primaryRelease.date) {
      const yearMatch = primaryRelease.date.match(/^(\d{4})/);
      if (yearMatch) {
        releaseYear = parseInt(yearMatch[1], 10);
      }
    }
  }

  let durationSecs: number | undefined;
  if (track.duration !== undefined) {
    durationSecs = track.duration;
  } else if (typeof track.durationMs === 'number') {
    durationSecs = Math.round((track.durationMs / 1000) * 1000) / 1000;
  } else if (typeof track.length === 'number') {
    durationSecs = Math.round((track.length / 1000) * 1000) / 1000;
  }

  const isrc = (track.isrc ?? (Array.isArray(track.isrcs) ? track.isrcs[0] : undefined))?.trim();

  return {
    id: track.id ?? track.recordingId,
    title: track.title,
    artists,
    album,
    durationSecs,
    isrc: isrc || undefined,
    musicBrainzRecordingId: (track.recordingId ?? track.id)?.trim() || undefined,
    releaseYear,
    trackNumber: track.trackNumber,
    discNumber: track.discNumber
  };
}
