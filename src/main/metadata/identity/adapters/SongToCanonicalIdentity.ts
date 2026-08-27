import type { CanonicalTrackIdentity } from '../CanonicalTrackIdentity';

export type SongArtistRecord =
  | string
  | { name?: string; [key: string]: unknown }
  | { artist?: { name?: string; [key: string]: unknown }; [key: string]: unknown };

export type SongGenreRecord =
  | string
  | { name?: string; [key: string]: unknown }
  | { genre?: { name?: string; [key: string]: unknown }; [key: string]: unknown };

export interface MinimalSongRecord {
  id?: number;
  songId?: number;
  title: string;
  artists?: SongArtistRecord[] | string | null;
  album?: { name?: string; title?: string } | string | null;
  albumArtist?: string | null;
  duration?: number | string | null;
  year?: number | null;
  trackNumber?: number | null;
  trackNo?: number | null;
  discNumber?: number | null;
  isrc?: string | null;
  musicBrainzRecordingId?: string | null;
  genre?: string | null;
  genres?: SongGenreRecord[] | null;
  path?: string | null;
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
      return trimmed || undefined;
    }
    if ('artist' in record && record.artist && typeof record.artist === 'object') {
      if ('name' in record.artist && typeof record.artist.name === 'string') {
        const trimmed = record.artist.name.trim();
        return trimmed || undefined;
      }
    }
  }
  return undefined;
}

export function toCanonicalFromSong(song: MinimalSongRecord): CanonicalTrackIdentity {
  const artists: string[] = [];

  if (Array.isArray(song.artists)) {
    for (const a of song.artists) {
      const name = extractArtistName(a);
      if (name && !artists.includes(name)) {
        artists.push(name);
      }
    }
  } else if (typeof song.artists === 'string') {
    const trimmed = song.artists.trim();
    if (trimmed && !artists.includes(trimmed)) {
      artists.push(trimmed);
    }
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
    if (typeof first === 'string') {
      genre = first.trim() || undefined;
    } else if (first && typeof first === 'object') {
      if ('genre' in first && first.genre && typeof first.genre === 'object' && typeof (first.genre as { name?: unknown }).name === 'string') {
        genre = ((first.genre as { name: string }).name).trim() || undefined;
      } else if ('name' in first && typeof (first as { name?: unknown }).name === 'string') {
        genre = ((first as { name: string }).name).trim() || undefined;
      }
    }
  }

  return {
    id: song.id ?? song.songId,
    title: song.title,
    artists,
    album,
    albumArtist: song.albumArtist?.trim() || undefined,
    durationSecs: song.duration !== undefined && song.duration !== null ? Number(song.duration) : undefined,
    releaseYear: song.year || undefined,
    trackNumber: (song.trackNumber ?? song.trackNo) ?? undefined,
    discNumber: song.discNumber ?? undefined,
    isrc: song.isrc?.trim() || undefined,
    musicBrainzRecordingId: song.musicBrainzRecordingId?.trim() || undefined,
    genre,
    pathOrUri: song.path ?? undefined
  };
}
