import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';

import calculateTimeFromSeconds from '../../utils/calculateTimeFromSeconds';
import Img from '../Img';
import SongArtist from '../SongsPage/SongArtist';

type Props = { albumData: Album; songsData: SongData[] };

const AlbumImgAndInfoContainer = (props: Props) => {
  const { t } = useTranslation();

  const { albumData, songsData } = props;

  const { openAutoTagDialog } = useContext(AppUpdateContext);

  const albumDuration = useMemo(
    () =>
      calculateTimeFromSeconds(songsData.reduce((prev, current) => prev + current.duration, 0))
        .timeString,
    [songsData]
  );

  const albumArtistComponents = useMemo(() => {
    const artists = albumData?.artists;
    if (Array.isArray(artists) && artists.length > 0)
      return artists
        .map((artist, i) => {
          const arr = [
            <SongArtist
              key={artist.artistId}
              artistId={artist.artistId}
              name={artist.name}
              className="text-lg!"
            />
          ];

          if ((artists?.length ?? 1) - 1 !== i) arr.push(<span className="mr-1">,</span>);

          return arr;
        })
        .flat();
    return <span className="text-xs font-normal">{t(`common.unknownArtist`)}</span>;
  }, [albumData?.artists, t]);

  return (
    <>
      {albumData && (
        <div className="album-img-and-info-container flex flex-row items-center pb-6">
          <div className="album-cover-container mr-8">
            {albumData.artworkPaths && (
              <Img
                src={albumData.artworkPaths.artworkPath}
                className="w-52 rounded-xl"
                loading="eager"
                alt="Album Cover"
              />
            )}{' '}
          </div>
          {albumData.title && albumData.artists && (
            <div className="album-info-container text-font-color-black dark:text-font-color-white max-w-[70%]">
              <div className="font-semibold tracking-wider uppercase opacity-50">
                {t(`common.album_one`)}
              </div>
              <div className="album-title text-font-color-highlight dark:text-dark-font-color-highlight h-fit w-full overflow-hidden py-2 text-5xl text-ellipsis whitespace-nowrap">
                {albumData.title}
              </div>
              <div className="album-artists m-0 flex h-[unset] w-full cursor-pointer overflow-hidden text-xl text-ellipsis whitespace-nowrap">
                {albumArtistComponents}
              </div>
              {songsData.length > 0 && (
                <div className="album-songs-total-duration">{albumDuration}</div>
              )}
              <div className="album-no-of-songs w-full overflow-hidden text-base text-ellipsis whitespace-nowrap">
                {t(`common.songWithCount`, { count: albumData.songs.length })}
              </div>
              {albumData.year && <div className="album-year">{albumData.year}</div>}
              <button
                onClick={() => {
                  if (openAutoTagDialog) {
                    openAutoTagDialog(songsData, albumData.title, albumData.artists?.[0]?.name);
                  }
                }}
                className="mt-3 flex items-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md hover:from-blue-500 hover:to-indigo-500 cursor-pointer"
              >
                <span>✨</span> Auto Tag Album
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default AlbumImgAndInfoContainer;
