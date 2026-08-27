import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';

import useHeartBurst from '../../hooks/useHeartBurst';
import calculateTimeFromSeconds from '../../utils/calculateTimeFromSeconds';
import Button from '../Button';
import HeartBurst from '../HeartBurst';
import Img from '../Img';
import SongArtist from '../SongsPage/SongArtist';

type Props = { albumData: Album; songsData: SongData[] };

const AlbumImgAndInfoContainer = (props: Props) => {
  const { t } = useTranslation();

  const { albumData, songsData } = props;

  const { openAutoTagDialog } = useContext(AppUpdateContext);

  const [isFavorite, setIsFavorite] = useState(albumData?.isAFavorite ?? false);
  const { isBursting, triggerBurst } = useHeartBurst();

  useEffect(() => {
    setIsFavorite(albumData?.isAFavorite ?? false);
  }, [albumData?.isAFavorite]);

  const toggleLikeAlbum = useCallback(async () => {
    if (!albumData) return;
    const nextValue = !isFavorite;
    if (nextValue) {
      triggerBurst();
    }
    setIsFavorite(nextValue);
    try {
      await window.api.albumsData.toggleLikeAlbums([albumData.albumId], nextValue);
    } catch {
      setIsFavorite(!nextValue);
    }
  }, [albumData, isFavorite, triggerBurst]);

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
          <div className="album-cover-container relative mr-8 shrink-0">
            {albumData.artworkPaths && (
              <Img
                src={albumData.artworkPaths.artworkPath}
                className="w-52 rounded-xl"
                loading="eager"
                alt="Album Cover"
              />
            )}
            <div className="absolute -bottom-4 right-4 flex items-center justify-center">
              <Button
                className="bg-background-color-1 text-font-color-highlight hover:bg-background-color-1 dark:bg-dark-background-color-2 dark:hover:bg-dark-background-color-2 m-0! flex rounded-full border-0! p-2.5! shadow-xl -outline-offset-[6px] focus-visible:outline!"
                tooltipLabel={t(
                  `common.${isFavorite ? 'dislike' : 'like'}`
                )}
                iconName="favorite"
                iconClassName={`text-3xl! leading-none! ${
                  isFavorite
                    ? 'material-icons-round text-[#FF2D55]!'
                    : 'material-icons-round-outlined'
                } ${isBursting ? 'fx-heart-pop' : ''}`}
                clickHandler={toggleLikeAlbum}
              />
              <HeartBurst isBursting={isBursting} />
            </div>
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
              <Button
                className="mt-3"
                iconName="auto_awesome"
                label="Auto Tag Album"
                clickHandler={() => {
                  if (openAutoTagDialog) {
                    openAutoTagDialog(songsData, albumData.title, albumData.artists?.[0]?.name);
                  }
                }}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
};

export default AlbumImgAndInfoContainer;
