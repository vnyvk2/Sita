import isLyricsSynced from '../../../common/isLyricsSynced';

export const manageAlbumData = (
  albumData: Album[],
  album?: string,
  songArtwork?: string
): SongTagsAlbumData | undefined => {
  if (albumData.length > 0)
    return {
      title: albumData[0].title,
      albumId: albumData[0].albumId,
      artists: albumData[0].artists?.map((x) => x.name),
      artworkPath: albumData[0].artworkPaths.artworkPath,
      noOfSongs: albumData[0].songs.length
    };

  if (album) return { title: album, artworkPath: songArtwork, noOfSongs: 1 };
  return undefined;
};

export const manageArtistsData = (
  artistData: Artist[],
  artists: string[]
): SongTagsArtistData[] | undefined => {
  const artistsInfo: SongTagsArtistData[] = artistData.map((data) => ({
    name: data.name,
    artistId: data.artistId,
    artworkPath: data.artworkPaths.optimizedArtworkPath,
    onlineArtworkPaths: data.onlineArtworkPaths
  }));

  for (const artistName of artists) {
    if (!artistsInfo.some((x) => x.name === artistName)) artistsInfo.push({ name: artistName });
  }

  return artistsInfo;
};

export const manageGenresData = (
  genreData: Genre[],
  genres?: string[]
): SongTagsGenreData[] | undefined => {
  if (genres) {
    const genresInfo: SongTagsGenreData[] = genreData.map((data) => ({
      name: data.name,
      genreId: data.genreId,
      artworkPath: data.artworkPaths.optimizedArtworkPath
    }));

    for (const genreName of genres) {
      if (!genresInfo.some((x) => x.name === genreName)) genresInfo.push({ name: genreName });
    }

    return genresInfo;
  }
  return undefined;
};

export const manageArtworks = (prevData: SongTags, artworkPaths?: string[]) =>
  Array.isArray(artworkPaths) && artworkPaths.length > 0
    ? artworkPaths.at(-1) || artworkPaths[0]
    : prevData.artworkPath;

export interface IncomingMetadataPayload {
  title?: string;
  artists?: string[];
  album?: string;
  genres?: string[];
  releasedYear?: number;
  lyrics?: string;
  artworkPaths?: string[];
  selectedArtwork?: string;
}

export interface ResolvedMetadataEntities {
  albumData?: Album[];
  artistData?: Artist[];
  genreData?: Genre[];
}

export interface SelectedMetadataFields {
  isTitleSelected?: boolean;
  isArtistsSelected?: boolean;
  isAlbumSelected?: boolean;
  isReleasedYearSelected?: boolean;
  isGenresSelected?: boolean;
  isLyricsSelected?: boolean;
}

/**
 * Pure helper to merge incoming online metadata into existing song tags non-destructively.
 * Only overwrites fields for which incoming metadata provides a non-empty, selected value.
 */
export const mergeSongMetadata = (
  prevData: SongTags,
  incoming: IncomingMetadataPayload,
  entities: ResolvedMetadataEntities = {},
  selected: SelectedMetadataFields = {}
): SongTags => {
  const {
    isTitleSelected = true,
    isArtistsSelected = true,
    isAlbumSelected = true,
    isReleasedYearSelected = true,
    isGenresSelected = true,
    isLyricsSelected = true
  } = selected;

  const { title, artists, album, genres, releasedYear, lyrics, artworkPaths, selectedArtwork } =
    incoming;
  const { albumData = [], artistData = [], genreData = [] } = entities;

  const artworkPath =
    selectedArtwork || manageArtworks(prevData, artworkPaths) || prevData.artworkPath;
  const isLyricsSynchronised = isLyricsSynced(lyrics || '');

  const newAlbum =
    isAlbumSelected && album?.trim()
      ? manageAlbumData(albumData, album, artworkPath)
      : undefined;

  const newArtists =
    isArtistsSelected && Array.isArray(artists) && artists.length > 0
      ? manageArtistsData(artistData, artists)
      : undefined;

  const newGenres =
    isGenresSelected && Array.isArray(genres) && genres.length > 0
      ? manageGenresData(genreData, genres)
      : undefined;

  return {
    ...prevData,
    title: isTitleSelected && title?.trim() ? title : prevData.title,
    releasedYear:
      isReleasedYearSelected && typeof releasedYear === 'number' && releasedYear > 0
        ? releasedYear
        : prevData.releasedYear,
    synchronizedLyrics:
      isLyricsSelected && lyrics && isLyricsSynchronised ? lyrics : prevData.synchronizedLyrics,
    unsynchronizedLyrics:
      isLyricsSelected && lyrics && !isLyricsSynchronised ? lyrics : prevData.unsynchronizedLyrics,
    artworkPath,
    albums: newAlbum ? [newAlbum] : prevData.albums,
    artists: newArtists && newArtists.length > 0 ? newArtists : prevData.artists,
    genres: newGenres && newGenres.length > 0 ? newGenres : prevData.genres
  };
};
