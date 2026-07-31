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
  filteredSongsCount?: number;
};

const PlaylistInfoAndImgContainer = (props: Props) => {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { t } = useTranslation();

  const { playlist, songs, filteredSongsCount } = props;

  const isFiltered = filteredSongsCount !== undefined && filteredSongsCount !== songs.length;

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
                  className="w-52 rounded-xl lg:w-48"
                  alt="Playlist Cover"
                />
              )}
            </div>
            <div className="playlist-info-container text-font-color-black dark:text-font-color-white ml-8">
              <div className="font-semibold tracking-wider uppercase opacity-50">
                {t('common.playlist_one')}
              </div>
              <div className="playlist-name text-font-color-highlight dark:text-dark-font-color-highlight mb-2 w-full overflow-hidden text-5xl text-ellipsis whitespace-nowrap">
                {playlist.name}
              </div>
              <div className="playlist-no-of-songs w-full overflow-hidden text-base text-ellipsis whitespace-nowrap">
                {isFiltered
                  ? `${t('common.songWithCount', { count: filteredSongsCount })} (${t('common.filteredFromTotal', { total: playlist.itemCount, defaultValue: `filtered from ${playlist.itemCount} total` })})`
                  : t('common.songWithCount', { count: playlist.itemCount })}
              </div>
              {songs.length > 0 && (
                <div className="playlist-total-duration">{totalPlaylistDuration}</div>
              )}
              {playlist.createdAt && (
                <div className="playlist-created-date">
                  {t('playlistsPage.createdOn', {
                    val: new Date(playlist.createdAt),
                    formatParams: {
                      val: {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      }
                    }
                  })}
                </div>
              )}
            </div>
        </div>
      )}
    </>
  );
};

export default PlaylistInfoAndImgContainer;
