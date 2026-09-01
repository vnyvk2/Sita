import type { LocalSongInput } from '../services/AlbumMetadataService';
import { extractStringValue } from './TrackMatcher';

/**
 * Normalizes diverse song representations (renderer SongData, database rows, ad-hoc inputs) into a
 * canonical, flat LocalSongInput baseline for the AutoTag diff and matching engines.
 */
export class LocalSongNormalizer {
  /** Normalizes any loose or heterogeneous song object into a canonical LocalSongInput. */
  public static normalize(input: unknown): LocalSongInput {
    if (!input || typeof input !== 'object') {
      return {
        songId: 0,
        title: '',
        path: ''
      };
    }

    const obj = input as Record<string, unknown>;

    // 1. Resolve songId
    const songId =
      typeof obj.songId === 'number'
        ? obj.songId
        : typeof obj.id === 'number'
          ? obj.id
          : typeof obj.songId === 'string'
            ? parseInt(obj.songId, 10) || 0
            : 0;

    // 2. Resolve title
    const title =
      typeof obj.title === 'string' ? obj.title : typeof obj.name === 'string' ? obj.name : '';

    // 3. Resolve path
    const path = typeof obj.path === 'string' ? obj.path : '';

    // 4. Resolve artist (handles string, artist object with name, or artists array)
    let artist: string | undefined;
    if (typeof obj.artist === 'string' && obj.artist.trim()) {
      artist = obj.artist.trim();
    } else if (Array.isArray(obj.artists) && obj.artists.length > 0) {
      const names = obj.artists
        .map((a: unknown) => {
          if (typeof a === 'string') return a;
          if (typeof a === 'object' && a !== null) {
            const artObj = a as Record<string, unknown>;
            if (typeof artObj.name === 'string') return artObj.name;
            if (
              artObj.artist &&
              typeof (artObj.artist as Record<string, unknown>).name === 'string'
            ) {
              return (artObj.artist as Record<string, unknown>).name as string;
            }
          }
          return undefined;
        })
        .filter((n): n is string => Boolean(n && n.trim()));
      if (names.length > 0) {
        artist = names.join(', ');
      }
    } else {
      artist = extractStringValue(obj.artist);
    }

    // 5. Resolve album (handles string or album object with title/name)
    let album: string | undefined;
    if (typeof obj.album === 'string' && obj.album.trim()) {
      album = obj.album.trim();
    } else if (Array.isArray(obj.albums) && obj.albums.length > 0) {
      const first = obj.albums[0];
      if (typeof first === 'object' && first !== null) {
        const albObj = first as Record<string, unknown>;
        const innerAlb = (albObj.album ?? albObj) as Record<string, unknown>;
        album =
          typeof innerAlb.title === 'string'
            ? innerAlb.title
            : typeof innerAlb.name === 'string'
              ? innerAlb.name
              : undefined;
      }
    } else {
      album = extractStringValue(obj.album);
    }

    // 6. Resolve genre (handles string, genre object, or genres array)
    let genre: string | undefined;
    if (typeof obj.genre === 'string' && obj.genre.trim()) {
      genre = obj.genre.trim();
    } else if (Array.isArray(obj.genres) && obj.genres.length > 0) {
      const names = obj.genres
        .map((g: unknown) => {
          if (typeof g === 'string') return g;
          if (typeof g === 'object' && g !== null) {
            const genObj = g as Record<string, unknown>;
            if (typeof genObj.name === 'string') return genObj.name;
            if (
              genObj.genre &&
              typeof (genObj.genre as Record<string, unknown>).name === 'string'
            ) {
              return (genObj.genre as Record<string, unknown>).name as string;
            }
          }
          return undefined;
        })
        .filter((n): n is string => Boolean(n && n.trim()));
      if (names.length > 0) {
        genre = names.join(', ');
      }
    } else {
      genre = extractStringValue(obj.genre);
    }

    // 7. Resolve year
    let year: number | undefined;
    if (typeof obj.year === 'number' && Number.isFinite(obj.year)) {
      year = obj.year;
    } else if (typeof obj.year === 'string') {
      const parsedYear = parseInt(obj.year, 10);
      if (Number.isFinite(parsedYear)) year = parsedYear;
    }

    // 8. Resolve track number (handles trackNumber or trackNo)
    let trackNumber: number | undefined;
    const rawTrackNo = obj.trackNumber ?? obj.trackNo;
    if (typeof rawTrackNo === 'number' && Number.isFinite(rawTrackNo)) {
      trackNumber = rawTrackNo;
    } else if (typeof rawTrackNo === 'string') {
      const parsed = parseInt(rawTrackNo, 10);
      if (Number.isFinite(parsed)) trackNumber = parsed;
    }

    // 9. Resolve disc number (handles discNumber, discNo, or diskNumber)
    let discNumber: number | undefined;
    const rawDiscNo = obj.discNumber ?? obj.discNo ?? obj.diskNumber;
    if (typeof rawDiscNo === 'number' && Number.isFinite(rawDiscNo)) {
      discNumber = rawDiscNo;
    } else if (typeof rawDiscNo === 'string') {
      const parsed = parseInt(rawDiscNo, 10);
      if (Number.isFinite(parsed)) discNumber = parsed;
    }

    // 10. Resolve duration
    let duration: number | undefined;
    if (typeof obj.duration === 'number' && Number.isFinite(obj.duration)) {
      duration = obj.duration;
    } else if (typeof obj.duration === 'string') {
      const parsed = parseFloat(obj.duration);
      if (Number.isFinite(parsed)) duration = parsed;
    }

    // 11. Resolve ISRC and MBID
    const isrc = typeof obj.isrc === 'string' && obj.isrc.trim() ? obj.isrc.trim() : undefined;
    const musicBrainzRecordingId =
      typeof obj.musicBrainzRecordingId === 'string' && obj.musicBrainzRecordingId.trim()
        ? obj.musicBrainzRecordingId.trim()
        : undefined;

    return {
      songId,
      path,
      title,
      artist,
      album,
      year,
      trackNumber,
      discNumber,
      genre,
      duration,
      isrc,
      musicBrainzRecordingId
    };
  }

  /** Maps a relational SQLite song row (returned from getSongById) into canonical LocalSongInput. */
  public static fromDbSong(dbSong: any): LocalSongInput {
    if (!dbSong) {
      return { songId: 0, title: '', path: '' };
    }

    const artists = Array.isArray(dbSong.artists)
      ? dbSong.artists
          .map((a: any) => a?.artist?.name ?? a?.name)
          .filter(Boolean)
          .join(', ')
      : undefined;

    const album =
      Array.isArray(dbSong.albums) && dbSong.albums.length > 0
        ? (dbSong.albums[0]?.album?.title ??
          dbSong.albums[0]?.album?.name ??
          dbSong.albums[0]?.title)
        : (dbSong.album?.title ?? dbSong.album?.name ?? undefined);

    // Release-level artist from the albums_artists junction - distinct from
    // the per-track artists above.
    const albumArtists =
      Array.isArray(dbSong.albums) && dbSong.albums.length > 0
        ? dbSong.albums[0]?.album?.artists
        : undefined;
    const albumArtist = Array.isArray(albumArtists)
      ? albumArtists
          .map((a: any) => a?.artist?.name ?? a?.name)
          .filter(Boolean)
          .join(', ') || undefined
      : undefined;

    const genres = Array.isArray(dbSong.genres)
      ? dbSong.genres
          .map((g: any) => g?.genre?.name ?? g?.name)
          .filter(Boolean)
          .join(', ')
      : undefined;

    return {
      songId: dbSong.id ?? dbSong.songId ?? 0,
      path: dbSong.path ?? '',
      title: dbSong.title ?? '',
      artist: artists || undefined,
      albumArtist: albumArtist || undefined,
      album: album || undefined,
      genre: genres || undefined,
      year: dbSong.year ?? undefined,
      trackNumber: dbSong.trackNumber ?? undefined,
      discNumber: dbSong.diskNumber ?? dbSong.discNumber ?? undefined,
      duration: dbSong.duration !== undefined ? Number(dbSong.duration) : undefined,
      isrc: dbSong.isrc ?? undefined,
      musicBrainzRecordingId: dbSong.musicBrainzRecordingId ?? undefined
    };
  }
}
