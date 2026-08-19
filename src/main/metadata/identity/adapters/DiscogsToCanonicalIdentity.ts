import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export interface DiscogsTrackInput {
  id?: string | number;
  title: string;
  artists?: Array<{ name: string } | string> | string;
  album?: string;
  duration?: string | number;
  position?: string;
  year?: number;
  extraartists?: Array<{ name: string; role?: string }>;
}

export interface DiscogsReleaseContext {
  title?: string;
  year?: number;
}

function parseDiscogsDuration(duration?: string | number): number | undefined {
  if (typeof duration === 'number') return duration;
  if (!duration || typeof duration !== 'string') return undefined;

  const parts = duration.split(':').map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return undefined;

  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return undefined;
}

export function toCanonicalFromDiscogs(
  track: DiscogsTrackInput,
  releaseContext?: DiscogsReleaseContext
): CanonicalTrackIdentity {
  const artists: string[] = [];
  if (Array.isArray(track.artists)) {
    for (const a of track.artists) {
      if (typeof a === 'string') {
        const trimmed = a.trim();
        if (trimmed) artists.push(trimmed);
      } else if (a && typeof a.name === 'string') {
        const trimmed = a.name.trim();
        if (trimmed) artists.push(trimmed);
      }
    }
  } else if (typeof track.artists === 'string') {
    const trimmed = track.artists.trim();
    if (trimmed) artists.push(trimmed);
  }

  let trackNumber: number | undefined;
  if (track.position) {
    const parsed = parseInt(track.position.replace(/\D/g, ''), 10);
    if (!isNaN(parsed)) trackNumber = parsed;
  }

  const album = (track.album ?? releaseContext?.title)?.trim() || undefined;
  const releaseYear = track.year ?? releaseContext?.year;

  return {
    id: track.id,
    title: track.title,
    artists,
    album,
    durationSecs: parseDiscogsDuration(track.duration),
    releaseYear,
    trackNumber
  };
}
