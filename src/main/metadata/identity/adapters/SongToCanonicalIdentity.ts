import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export interface MinimalSongRecord {
  id?: number;
  songId?: number;
  title: string;
  artists?: Array<{ name: string } | string> | string;
  album?: { name?: string; title?: string } | string;
  albumArtist?: string;
  duration?: number;
  year?: number;
  trackNumber?: number;
  trackNo?: number;
  discNumber?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  genre?: string;
  genres?: Array<{ name: string } | string>;
  path?: string;
}

export function toCanonicalFromSong(song: MinimalSongRecord): CanonicalTrackIdentity {
  const artists: string[] = [];

  if (Array.isArray(song.artists)) {
    for (const a of song.artists) {
      if (typeof a === 'string') {
        const trimmed = a.trim();
        if (trimmed) artists.push(trimmed);
      } else if (a && typeof a.name === 'string') {
        const trimmed = a.name.trim();
        if (trimmed) artists.push(trimmed);
      }
    }
  } else if (typeof song.artists === 'string') {
    const trimmed = song.artists.trim();
    if (trimmed) artists.push(trimmed);
  }

  let album: string | undefined;
  if (typeof song.album === 'string') {
    album = song.album.trim() || undefined;
  } else if (song.album && typeof song.album === 'object') {
    album = (song.album.title ?? song.album.name)?.trim() || undefined;
  }

  let genre: string | undefined;
  if (typeof song.genre === 'string') {
    genre = song.genre.trim() || undefined;
  } else if (Array.isArray(song.genres) && song.genres.length > 0) {
    const first = song.genres[0];
    genre = (typeof first === 'string' ? first : first?.name)?.trim() || undefined;
  }

  return {
    id: song.id ?? song.songId,
    title: song.title,
    artists,
    album,
    albumArtist: song.albumArtist?.trim() || undefined,
    durationSecs: song.duration !== undefined ? Number(song.duration) : undefined,
    isrc: song.isrc?.trim() || undefined,
    musicBrainzRecordingId: song.musicBrainzRecordingId?.trim() || undefined,
    releaseYear: song.year,
    trackNumber: song.trackNumber ?? song.trackNo,
    discNumber: song.discNumber,
    genre,
    pathOrUri: song.path
  };
}
