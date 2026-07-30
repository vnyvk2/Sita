import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultPlaylistCover from '../../assets/images/webp/playlist_cover_default.webp';
import calculateTimeFromSeconds from '../../utils/calculateTimeFromSeconds';
import Img from '../Img';
import MultipleArtworksCover from '../PlaylistsPage/MultipleArtworksCover';

import type { PlaylistDto } from '@main/collections/ipc/dtos';

type Props = {
  playlist: PlaylistDto;
  songs: SongData[];
};

const PlaylistInfoAndImgContainer = (props: Props) => {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { t } = useTranslation();

  const { playlist, songs } = props;

  const totalPlaylistDuration = useMemo(() => {
    const { timeString } = calculateTimeFromSeconds(
      songs.reduce((prev, current) => prev + current.duration, 0)
    );
    return timeString;
  }, [songs]);

  return (
    <>
      {playlist && (
        <div className="playlist-img-and-info-container mb-8 flex flex-row items-center justify-start">
          <div className="playlist-cover-container mt-2 overflow-hidden">
            {preferences.enableArtworkFromSongCovers && playlist.itemCount > 1 ? (
              <div className="relative h-60 w-60">
                <MultipleArtworksCover
                  collectionId={playlist.id}
                  artworks={songs.map((song) => song.artworkPaths)}
                  className="h-60 w-60"
                  type={1}
                />
                <Img
                  src={playlist.artworkPath || DefaultPlaylistCover}
                  alt="Playlist Cover"
                  loading="eager"
                  className="absolute! right-4 bottom-4 h-16 w-16 rounded-lg!"
                />
              </div>
            ) : (
              <Img
                src={playlist.artworkPath || DefaultPlaylistCover}
                alt="Playlist Cover"
                loading="eager"
                className="h-60 w-60 rounded-lg shadow-lg"
              />
            )}
          </div>
          <div className="playlist-info-container ml-8 flex flex-col items-start justify-center">
            <div className="playlist-name text-font-color-highlight dark:text-dark-font-color-highlight text-5xl font-semibold">
              {playlist.name}
            </div>
            <div className="playlist-no-of-songs text-font-color-black dark:text-font-color-white mt-2 flex items-center font-medium">
              <span className="material-symbols-round text-font-color-highlight dark:text-dark-font-color-highlight mr-2 text-2xl">
                music_note
              </span>
              {t('common.songWithCount', { count: playlist.itemCount })}
            </div>
            {playlist.createdAt && (
              <div className="playlist-created-date text-font-color-black dark:text-font-color-white mt-1 flex items-center font-medium">
                <span className="material-symbols-round text-font-color-highlight dark:text-dark-font-color-highlight mr-2 text-2xl">
                  calendar_today
                </span>
                {t('playlist.createdAt', {
                  val: new Date(playlist.createdAt),
                  formatParams: {
                    val: { year: 'numeric', month: 'short', day: 'numeric' }
                  }
                })}
              </div>
            )}
            {songs.length > 0 && (
              <div className="playlist-total-duration mt-1 flex items-center font-medium text-font-color-black dark:text-font-color-white">
                <span className="material-symbols-round text-font-color-highlight dark:text-dark-font-color-highlight mr-2 text-2xl">
                  schedule
                </span>
                {totalPlaylistDuration}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default PlaylistInfoAndImgContainer;
