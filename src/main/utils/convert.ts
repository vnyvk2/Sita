import { parsePaletteFromArtworks } from '@main/core/getAllSongs';
import type { GetAllAlbumsReturnType } from '@main/db/queries/albums';
import type { GetAllArtistsReturnType } from '@main/db/queries/artists';
import type { GetAllGenresReturnType } from '@main/db/queries/genres';
import type { GetAllPlaylistsReturnType } from '@main/db/queries/playlists';
import type { GetAllSongsReturnType } from '@main/db/queries/songs';
import {
  parseAlbumArtworks,
  parseArtistArtworks,
  parseArtistOnlineArtworks,
  parseGenreArtworks,
  parsePlaylistArtworks,
  parseSongArtworks
} from '@main/fs/resolveFilePaths';

export const convertToSongData = (
  song: GetAllSongsReturnType[number],
  languageOverride?: string
): SongData => {
  const artists = song.artists?.map((a) => ({ artistId: a.artist.id, name: a.artist.name })) ?? [];

  // Album (pick first if multiple)
  const albumObj = song.albums?.[0]?.album;
  const album = albumObj
    ? { albumId: albumObj.id, name: albumObj.title, isAFavorite: albumObj.isFavorite ?? false }
    : undefined;

  // Blacklist
  const isBlacklisted = song.isBlacklisted;
  // Track number
  const trackNo = song.trackNumber ?? undefined;
  // Added date
  const addedDate = song.createdAt ? new Date(song.createdAt).getTime() : 0;

  const artworks = song.artworks.map((a) => a.artwork);

  const albumArtists = albumObj
    ? (albumObj.artists?.map((a) => ({ artistId: a.artist.id, name: a.artist.name })) ?? [])
    : [];

  const genres = song.genres?.map((g) => ({ genreId: g.genre.id, name: g.genre.name })) ?? [];

  return {
    title: song.title,
    artists,
    album,
    albumArtists,
    genres,
    duration: Number(song.duration),
    artworkPaths: parseSongArtworks(artworks),
    path: song.path,
    songId: song.id,
    addedDate,
    isAFavorite: song.isFavorite,
    year: song.year ?? undefined,
    paletteData: parsePaletteFromArtworks(artworks),
    isBlacklisted,
    trackNo,
    isArtworkAvailable: artworks.length > 0,
    bitrate: song.bitRate ?? undefined,
    sampleRate: song.sampleRate ?? undefined,
    createdDate: song.createdAt ? new Date(song.createdAt).getTime() : 0,
    modifiedDate: song.updatedAt ? new Date(song.updatedAt).getTime() : undefined,
    discNo: song.diskNumber ?? undefined,
    noOfChannels: song.noOfChannels ?? undefined,
    language: languageOverride || song.language || undefined,
    musicBrainzId: song.musicBrainzRecordingId ?? undefined
  } satisfies SongData;
};

export const resolvePreferredArtistArtworks = <
  TArtwork extends {
    id: number;
    path: string;
    source: string;
    isOptimized?: boolean;
    width: number;
    height: number;
  }
>(artist: {
  artworks?: { artwork: TArtwork }[];
  albums?: {
    album: {
      artworks?: { artwork: TArtwork }[];
      artists?: { artistId: number }[];
    };
  }[];
  songs?: {
    song: {
      artworks?: { artwork: TArtwork }[];
      artists?: { artistId: number }[];
    };
  }[];
}): TArtwork[] => {
  const directArtworks = (artist.artworks ?? []).map((entry) => entry.artwork).filter(Boolean);
  const remoteArtworks = directArtworks.filter((artwork) => artwork.source === 'REMOTE');
  const directLocalArtworks = directArtworks.filter((artwork) => artwork.source !== 'REMOTE');

  // Tier 1: Solo album artwork (album where this artist is the sole Album Artist)
  for (const albumEntry of artist.albums ?? []) {
    const album = albumEntry?.album;
    const albumArtworks = (album?.artworks ?? [])
      .map((a) => a.artwork)
      .filter((a) => a && a.source !== 'REMOTE');
    const albumArtistCount = album?.artists?.length ?? 0;
    if (albumArtworks.length > 0 && albumArtistCount === 1) {
      return [...remoteArtworks, ...albumArtworks];
    }
  }

  // Tier 2: Any album artwork linked to this artist in albums_artists
  for (const albumEntry of artist.albums ?? []) {
    const albumArtworks = (albumEntry?.album?.artworks ?? [])
      .map((a) => a.artwork)
      .filter((a) => a && a.source !== 'REMOTE');
    if (albumArtworks.length > 0) {
      return [...remoteArtworks, ...albumArtworks];
    }
  }

  // Tier 3: Solo song artwork (song where this artist is the sole Song Artist)
  for (const songEntry of artist.songs ?? []) {
    const song = songEntry?.song;
    const songArtworks = (song?.artworks ?? [])
      .map((a) => a.artwork)
      .filter((a) => a && a.source !== 'REMOTE');
    const songArtistCount = song?.artists?.length ?? 0;
    if (songArtworks.length > 0 && songArtistCount === 1) {
      return [...remoteArtworks, ...songArtworks];
    }
  }

  // Tier 4: Direct artists_artworks fallback (or any song artwork if direct is empty)
  if (directLocalArtworks.length > 0) {
    return [...remoteArtworks, ...directLocalArtworks];
  }

  for (const songEntry of artist.songs ?? []) {
    const songArtworks = (songEntry?.song?.artworks ?? [])
      .map((a) => a.artwork)
      .filter((a) => a && a.source !== 'REMOTE');
    if (songArtworks.length > 0) {
      return [...remoteArtworks, ...songArtworks];
    }
  }

  return remoteArtworks;
};

export const convertToArtist = (artist: GetAllArtistsReturnType[number]) => {
  const artworks = resolvePreferredArtistArtworks(artist);

  return {
    artistId: artist.id,
    name: artist.name,
    artworkPaths: parseArtistArtworks(artworks as never),
    songs: artist.songs.map((s) => ({
      title: s.song.title,
      songId: s.song.id
    })),
    albums:
      artist.albums?.map((a) => ({
        title: a.album.title,
        albumId: a.album.id
      })) ?? [],
    onlineArtworkPaths: parseArtistOnlineArtworks(artworks as never),
    isAFavorite: artist.isFavorite
  } satisfies Artist;
};

export const convertToAlbum = (album: GetAllAlbumsReturnType[number]) => {
  const artworks = album.artworks.map((a) => a.artwork);
  const artists = album.artists?.map((a) => ({ artistId: a.artist.id, name: a.artist.name })) ?? [];

  return {
    albumId: album.id,
    title: album.title,
    artworkPaths: parseAlbumArtworks(artworks),
    artists,
    year: album.year ?? undefined,
    isAFavorite: album.isFavorite ?? false,
    songs: album.songs.map((s) => ({
      title: s.song.title,
      songId: s.song.id
    }))
  } satisfies Album;
};

export const convertToPlaylist = (playlist: GetAllPlaylistsReturnType['data'][number]) => {
  const artworks = playlist.artworks.map((a) => a.artwork);
  const songIds = (
    playlist as { entries?: { song: { id: number } }[]; songs?: { song: { id: number } }[] }
  ).entries
    ? (playlist as { entries?: { song: { id: number } }[] }).entries!.map((e) => e.song.id)
    : ((playlist as { songs?: { song: { id: number } }[] }).songs?.map((s) => s.song.id) ?? []);

  return {
    playlistId: playlist.id,
    name: playlist.name,
    artworkPaths: parsePlaylistArtworks(artworks),
    songs: songIds,
    isArtworkAvailable: artworks.length > 0,
    createdDate: playlist.createdAt
  } satisfies Playlist;
};

export const convertToGenre = (genre: GetAllGenresReturnType['data'][number]) => {
  const artworks = genre.artworks.map((a) => a.artwork);
  return {
    genreId: genre.id,
    name: genre.name,
    artworkPaths: parseGenreArtworks(artworks),
    songs: genre.songs.map((s) => ({
      title: s.song.title,
      songId: s.song.id
    }))
  } satisfies Genre;
};

// export const convertToSongListeningData = (
//   listeningData: GetAllSongListeningDataReturnType[number]
// ): SongListeningData => {
//   return {
//     songId: String(listeningData.id),
//     skips: listeningData.skipEvents.length,
//     listens:
//   };
// };
