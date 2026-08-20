import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export type SongArtistRecord =
  | string
  | { name?: string; [key: string]: unknown }
  | { artist?: { name?: string; [key: string]: unknown }; [key: string]: unknown };

export interface MinimalSongRecord {
  id?: number;
  songId?: number;
  title: string;
  artists?: SongArtistRecord[] | string;
  album?: { name?: string; title?: string } | string;
  albumArtist?: string;
  duration?: number | string;
  year?: number;
  trackNumber?: number;
  trackNo?: number;
  discNumber?: number;
  isrc?: string;
  musicBrainzRecordingId?: string;
  genre?: string;
  genres?: Array<{ name?: string } | string>;
  path?: string;
}

function extractArtistName(record: SongArtistRecord | null | undefined): string | undefined {
  if (!record) return undefined;
  if (typeof record === 'string') {
    const trimmed = record.trim();
    return trimmed || undefined;
  }
  if (typeof record === 'object') {
    if ('name' in record && typeof record.name === 'string') {
      const trimmed = record.name.trim();
      if (trimmed) return trimmed;
    }
    if ('artist' in record && record.artist && typeof record.artist === 'object' && typeof record.artist.name === 'string') {
      const trimmed = record.artist.name.trim();
      if (trimmed) return trimmed;
    }
  }
  return undefined;
}

export function toCanonicalFromSong(song: MinimalSongRecord): CanonicalTrackIdentity {
  const artists: string[] = [];

  if (Array.isArray(song.artists)) {
    for (const a of song.artists) {
      const name = extractArtistName(a);
      if (name) artists.push(name);
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
    releaseYear: song.year || undefined,
    trackNumber: song.trackNumber ?? song.trackNo,
    discNumber: song.discNumber,
    isrc: song.isrc?.trim() || undefined,
    musicBrainzRecordingId: song.musicBrainzRecordingId?.trim() || undefined,
    genre,
    pathOrUri: song.path
  };
}
