import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultPlaylistCover from '../../assets/images/webp/playlist_cover_default.webp';
import calculateTimeFromSeconds from '../../utils/calculateTimeFromSeconds';
import Img from '../Img';
import { useContext } from 'react';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import PlaylistCover from '../PlaylistsPage/PlaylistCover';
import PlaylistCoverSettingsPrompt from '../PlaylistsPage/PlaylistCoverSettingsPrompt';

import type { PlaylistDto } from '@main/collections/ipc/dtos';

type Props = {
  playlist: PlaylistDto;
  songs: SongData[];
  filteredSongs?: SongData[];
};

const PlaylistInfoAndImgContainer = (props: Props) => {
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const { playlist, songs, filteredSongs } = props;

  const displaySongs = filteredSongs ?? songs;
  const isFiltered = Boolean(filteredSongs && filteredSongs.length !== songs.length);

  const totalPlaylistDuration = useMemo(() => {
    const { timeString } = calculateTimeFromSeconds(
      displaySongs.reduce((prev, current) => prev + current.duration, 0)
    );
    return timeString;
  }, [displaySongs]);

  const openCoverSettings = () => {
    changePromptMenuData(
      true,
      <PlaylistCoverSettingsPrompt playlist={playlist} playlistSongs={songs} />,
      'max-w-5xl w-full min-w-0',
      { mode: 'workspace', scrollBehavior: 'content' }
    );
  };

  return (
    <>
      {playlist && (
        <div className="playlist-img-and-info-container mb-8 flex flex-row items-center justify-start">
          <div className="playlist-cover-container group relative mt-2 overflow-hidden rounded-xl h-60 w-60">
            <PlaylistCover playlist={playlist} songs={songs} className="h-60 w-60" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCoverSettings();
              }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100 cursor-pointer backdrop-blur-xs"
              title={t('playlistsPage.editCover', 'Edit Cover')}
            >
              <span className="material-icons-round text-3xl text-white">edit</span>
              <span className="text-xs font-semibold tracking-wider text-white uppercase">Edit Cover</span>
            </button>
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
                  ? t('playlistsPage.filteredSongCount', {
                      count: displaySongs.length,
                      total: playlist.itemCount,
                      defaultValue: '{{count}} of {{total}} songs'
                    })
                  : t('common.songWithCount', { count: playlist.itemCount })}
              </div>
              {displaySongs.length > 0 && (
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
