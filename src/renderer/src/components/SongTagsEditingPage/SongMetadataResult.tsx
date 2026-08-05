import { lazy, useCallback, useContext } from 'react';
import { useTranslation } from 'react-i18next';

import isLyricsSynced from '../../../../common/isLyricsSynced';
import DefaultSongImage from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import {
  manageArtworks,
  manageAlbumData,
  manageArtistsData,
  manageGenresData
} from '../../utils/manageMetadataResults';
import Button from '../Button';
import Img from '../Img';

const CustomizeSelectedMetadataPrompt = lazy(() => import('./CustomizeSelectedMetadataPrompt'));

interface SongMetadataResultProp {
  title: string;
  artists: string[];
  genres?: string[];
  album?: string;
  releasedYear?: number;
  lyrics?: string;
  artworkPaths?: string[];
  updateSongInfo: (callback: (prevData: SongTags) => SongTags) => void;
}

function SongMetadataResult(props: SongMetadataResultProp) {
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const { title, artists, genres, artworkPaths, album, lyrics, releasedYear, updateSongInfo } =
    props;

  const addToMetadata = useCallback(async () => {
    const albumData = album?.trim()
      ? await window.api.albumsData.getAlbumData([album]).then((res) => res.data).catch(() => [])
      : [];
    const artistData = Array.isArray(artists) && artists.length > 0
      ? await window.api.artistsData.getArtistData(artists).then((res) => res.data).catch(() => [])
      : [];
    const genreData = Array.isArray(genres) && genres.length > 0
      ? await window.api.genresData.getGenresData(genres).then((res) => res.data).catch(() => [])
      : [];

    updateSongInfo((prevData): SongTags => {
      changePromptMenuData(false, undefined, '');

      const artworkPath = manageArtworks(prevData, artworkPaths);
      const isLyricsSynchronised = isLyricsSynced(lyrics || '');

      const newAlbum = album?.trim()
        ? manageAlbumData(albumData, album, artworkPath)
        : undefined;

      const newArtists = Array.isArray(artists) && artists.length > 0
        ? manageArtistsData(artistData, artists)
        : undefined;

      const newGenres = Array.isArray(genres) && genres.length > 0
        ? manageGenresData(genreData, genres)
        : undefined;

      return {
        ...prevData,
        title: title?.trim() || prevData.title,
        releasedYear: (typeof releasedYear === 'number' && releasedYear > 0) ? releasedYear : prevData.releasedYear,
        synchronizedLyrics: lyrics && isLyricsSynchronised ? lyrics : prevData.synchronizedLyrics,
        unsynchronizedLyrics: lyrics && !isLyricsSynchronised ? lyrics : prevData.unsynchronizedLyrics,
        artworkPath: artworkPath || prevData.artworkPath,
        albums: newAlbum ? [newAlbum] : prevData.albums,
        artists: (newArtists && newArtists.length > 0) ? newArtists : prevData.artists,
        genres: (newGenres && newGenres.length > 0) ? newGenres : prevData.genres
      };
    });
  }, [
    album,
    artists,
    artworkPaths,
    changePromptMenuData,
    genres,
    lyrics,
    releasedYear,
    title,
    updateSongInfo
  ]);

  return (
    <div className="bg-background-color-2/70 hover:bg-background-color-2 dark:bg-dark-background-color-2/70 dark:hover:bg-dark-background-color-2 mb-2 flex h-32 min-h-[5rem] w-full cursor-pointer items-center justify-between rounded-md p-1 backdrop-blur-md">
      <div className="flex h-full max-w-[70%]">
        <div className="img-container m-1 mr-4 overflow-hidden rounded-md">
          <Img
            src={artworkPaths?.at(-1)}
            fallbackSrc={DefaultSongImage}
            className="aspect-square h-full max-w-full object-cover"
            alt=""
          />
        </div>
        <div className="song-result-info-container text-font-color-black dark:text-font-color-white flex max-w-[75%] flex-col justify-center">
          <p className="song-result-title relative w-full overflow-hidden text-xl text-ellipsis whitespace-nowrap">
            {title}
          </p>
          <p className="song-result-artists text-opacity-75 font-light">{artists.join(', ')}</p>
          {album && <p className="song-result-album text-opacity-75 text-sm font-light">{album}</p>}
          <span className="song-result-album text-opacity-75 flex text-sm font-light">
            {releasedYear && <span>{releasedYear}</span>}
            {releasedYear && <span className="mx-2">&bull;</span>}
            {lyrics && (
              <span className="flex items-center">
                <span className="material-icons-round-outlined text-font-color-highlight dark:text-dark-font-color-highlight mr-2">
                  verified
                </span>{' '}
                {lyrics && t('songTagsEditingPage.lyricsIncluded')}
              </span>
            )}
          </span>
        </div>
      </div>
      <div className="buttons-container flex items-center">
        <Button
          label={t('songTagsEditingPage.addToMetadata')}
          iconName="add"
          className="bg-background-color-3! text-font-color-black hover:border-background-color-3 dark:bg-dark-background-color-3! dark:text-font-color-black! dark:hover:border-background-color-3 h-fit px-8 text-lg"
          clickHandler={addToMetadata}
        />
        <Button
          key={0}
          className="more-options-btn hover:border-background-color-3! dark:border-dark-background-color-1! dark:hover:border-dark-background-color-3! text-sm md:text-lg md:[&>.button-label-text]:hidden md:[&>.icon]:mr-0"
          iconName="tune"
          clickHandler={() => {
            changePromptMenuData(
              true,
              <CustomizeSelectedMetadataPrompt
                title={title}
                artists={artists}
                album={album}
                artworkPaths={artworkPaths?.filter((x) => x.trim())}
                genres={genres}
                lyrics={lyrics}
                releasedYear={releasedYear}
                updateSongInfo={updateSongInfo}
              />
            );
          }}
          tooltipLabel={t('songTagsEditingPage.customizeMetadata')}
        />
      </div>
    </div>
  );
}
export default SongMetadataResult;
