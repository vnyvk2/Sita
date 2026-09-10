import type { PlaylistDto } from '@common/collections/dtos';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { useNavigate } from '@tanstack/react-router';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import calculateTimeFromSeconds from '../../utils/calculateTimeFromSeconds';
import PlaylistCover from '../PlaylistsPage/PlaylistCover';
import PlaylistCoverSettingsPrompt from '../PlaylistsPage/PlaylistCoverSettingsPrompt';
import ScrollableTitle from '../ScrollableTitle';

type Props = {
  playlist: PlaylistDto;
  songs: SongData[];
  filteredSongs?: SongData[];
};

const PlaylistInfoAndImgContainer = (props: Props) => {
  const { changePromptMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();

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
          <div className="playlist-cover-container group relative mt-2 h-60 w-60 shrink-0 overflow-hidden rounded-xl">
            <PlaylistCover playlist={playlist} songs={songs} className="h-60 w-60" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                openCoverSettings();
              }}
              className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-1 bg-black/60 opacity-0 backdrop-blur-xs transition-opacity duration-200 group-hover:opacity-100"
              title={t('playlistsPage.editCover', 'Edit Cover')}
            >
              <span className="material-icons-round text-3xl text-white">edit</span>
              <span className="text-xs font-semibold tracking-wider text-white uppercase">
                Edit Cover
              </span>
            </button>
          </div>
          <div className="playlist-info-container text-font-color-black dark:text-font-color-white ml-8 min-w-0 flex-1 overflow-hidden">
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wider uppercase opacity-50">
                {playlist.playlistType === 'smart' ? 'Smart Playlist' : t('common.playlist_one')}
              </span>
              {playlist.playlistType === 'smart' && (
                <span className="bg-background-color-3 dark:bg-dark-background-color-3 text-font-color-black dark:text-font-color-white inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
                  <span className="material-icons-round text-xs">auto_awesome</span>
                  Smart
                </span>
              )}
            </div>
            <ScrollableTitle
              title={playlist.name}
              className="playlist-name text-font-color-highlight dark:text-dark-font-color-highlight mb-2 text-5xl font-semibold"
            />
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
            {playlist.playlistType === 'smart' && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      to: '/main-player/playlists/smart-editor',
                      search: { playlistId: playlist.id }
                    })
                  }
                  className="bg-background-color-3 text-font-color-black dark:bg-dark-background-color-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold shadow-xs transition-opacity hover:opacity-90"
                >
                  <span className="material-icons-round text-sm">tune</span>
                  <span>Edit Rules</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default PlaylistInfoAndImgContainer;
