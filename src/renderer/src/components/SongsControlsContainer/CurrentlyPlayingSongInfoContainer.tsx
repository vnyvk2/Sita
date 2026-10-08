import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { lazy, useCallback, useContext, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import DefaultSongCover from '../../assets/images/webp/song_cover_default.webp';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { toggleRewindReveal, useRewindReveal } from '../../hooks/useRewindReveal';
import calculateTime from '../../utils/calculateTime';
import Img from '../Img';
import NavLink from '../NavLink';
import SongArtist from '../SongsPage/SongArtist';
import UpNextSongPopup from './UpNextSongPopup';

const AddSongsToPlaylistsPrompt = lazy(() => import('../SongsPage/AddSongsToPlaylistsPrompt'));
const BlacklistSongConfrimPrompt = lazy(() => import('../SongsPage/BlacklistSongConfirmPrompt'));
const DeleteSongsFromSystemConfrimPrompt = lazy(
  () => import('../SongsPage/DeleteSongsFromSystemConfrimPrompt')
);

const CurrentlyPlayingSongInfoContainer = () => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const navigate = useNavigate();

  const {
    updateContextMenuData,
    changePromptMenuData,
    toggleMultipleSelections,
    addNewNotifications
  } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const [isNextSongPopupVisible, setIsNextSongPopupVisible] = useState(false);
  const isCreditsRevealed = useRewindReveal(currentSongData.songId);
  const songDurationLabel = useMemo(() => {
    const time = calculateTime(currentSongData.duration || 0);
    return `${time.minutes}:${time.seconds}`;
  }, [currentSongData.duration]);

  const songArtistsImages = useMemo(() => {
    if (
      currentSongData.songId &&
      Array.isArray(currentSongData.artists) &&
      currentSongData.artists.length > 0
    )
      return currentSongData.artists
        .filter((artist, index) => artist.onlineArtworkPaths && index < 2)
        .map((artist, index) => (
          <Img
            key={artist.artistId}
            src={artist.onlineArtworkPaths?.picture_small}
            fallbackSrc={artist.artworkPath}
            loading="eager"
            className={`border-background-color-1 dark:border-dark-background-color-1 absolute aspect-square w-6 rounded-full border-2 ${
              index === 0 ? 'z-2' : '-translate-x-2'
            }`}
            onClick={() =>
              navigate({
                to: '/main-player/artists/$artistId',
                params: { artistId: String(artist.artistId) }
              })
            }
            alt=""
          />
        ));
    return undefined;
  }, [currentSongData.artists, currentSongData.songId, navigate]);

  const showSongInfoPage = useCallback(
    (songId: number) =>
      currentSongData.isKnownSource
        ? navigate({
            to: '/main-player/songs/$songId',
            params: { songId: String(songId) }
          })
        : undefined,
    [navigate, currentSongData.isKnownSource]
  );

  const gotToSongAlbumPage = useCallback(
    () =>
      currentSongData.isKnownSource && currentSongData.album
        ? navigate({
            to: '/main-player/albums/$albumId',
            params: { albumId: String(currentSongData.album.albumId) }
          })
        : undefined,
    [navigate, currentSongData.album, currentSongData.isKnownSource]
  );

  const songArtists = useMemo(() => {
    const { songId, artists, isKnownSource } = currentSongData;

    if (songId && Array.isArray(artists)) {
      if (artists.length > 0) {
        return artists
          .map((artist, i, artistArr) => {
            const arr = [
              <SongArtist
                key={artist.artistId}
                artistId={artist.artistId}
                name={artist.name}
                isFromKnownSource={isKnownSource}
              />
            ];

            if ((artists.length ?? 1) - 1 !== i)
              arr.push(
                <span key={`${artistArr[i].name},${artistArr[i + 1].name}`} className="mr-1">
                  ,
                </span>
              );

            return arr;
          })
          .flat();
      }
      return <span className="text-xs font-normal">{t('common.unknownArtist')}</span>;
    }
    return '';
  }, [currentSongData, t]);

  const contextMenuCurrentSongData = useMemo((): ContextMenuAdditionalData => {
    const { title, artworkPath, artists, album } = currentSongData;
    return {
      title,
      artworkPath: artworkPath ?? DefaultSongCover,
      subTitle: artists?.map((artist) => artist.name).join(', ') || t('common.unknownArtist'),
      subTitle2: album?.name
    };
  }, [currentSongData, t]);

  const contextMenuItems = useMemo((): ContextMenuItem[] => {
    const { title, songId, album, artworkPath, isBlacklisted, isKnownSource } = currentSongData;

    return [
      {
        label: t('song.addToPlaylists'),
        iconName: 'playlist_add',
        handlerFunction: () => {
          changePromptMenuData(
            true,
            <AddSongsToPlaylistsPrompt songIds={[songId]} title={title} />
          );
          toggleMultipleSelections(false);
        }
      },
      {
        label: 'Hr',
        isContextMenuItemSeperator: true,
        handlerFunction: () => true
      },
      {
        label: t('song.showInFileExplorer'),
        class: 'reveal-file-explorer',
        iconName: 'folder_open',
        handlerFunction: () => window.api.songUpdates.revealSongInFileExplorer(songId)
      },
      {
        label: t('common.info'),
        iconName: 'info',
        handlerFunction: () => showSongInfoPage(songId),
        isDisabled: !isKnownSource
      },
      {
        label: t('song.goToAlbum'),
        iconName: 'album',
        handlerFunction: gotToSongAlbumPage,
        isDisabled: !isKnownSource || !album
      },
      {
        label: t('song.editSongTags'),
        class: 'edit',
        iconName: 'edit',
        handlerFunction: () =>
          navigate({
            to: '/main-player/songs/$songId/edit',
            params: { songId: String(songId) }
          })
      },
      {
        label: t('common.saveArtwork'),
        class: 'edit',
        iconName: 'image',
        iconClassName: 'material-icons-round-outlined',
        handlerFunction: () =>
          artworkPath &&
          window.api.songUpdates.saveArtworkToSystem(
            artworkPath,
            `${title} song artwork`.replaceAll(' ', '_')
          ),
        isDisabled: currentSongData.artworkPath === undefined
      },
      {
        label: 'Hr',
        isContextMenuItemSeperator: true,
        handlerFunction: () => true
      },
      {
        label: t(`song.${isBlacklisted ? 'deblacklist' : 'blacklistSong'}`, {
          count: 1
        }),
        iconName: isBlacklisted ? 'settings_backup_restore' : 'block',
        handlerFunction: () => {
          if (isBlacklisted)
            window.api.audioLibraryControls
              .restoreBlacklistedSongs([songId])
              .catch((err) => console.error(err));
          else if (preferences?.doNotShowBlacklistSongConfirm)
            window.api.audioLibraryControls
              .blacklistSongs([songId])
              .then(() =>
                addNewNotifications([
                  {
                    id: `${title}Blacklisted`,
                    duration: 5000,
                    content: t('notifications.songBlacklisted', { title }),
                    icon: <span className="material-icons-round">block</span>
                  }
                ])
              )
              .catch((err) => console.error(err));
          else
            changePromptMenuData(
              true,
              <BlacklistSongConfrimPrompt title={title} songIds={[songId]} />
            );
          return toggleMultipleSelections(false);
        }
      },
      {
        label: t('song.delete'),
        iconName: 'delete',
        handlerFunction: () => {
          changePromptMenuData(true, <DeleteSongsFromSystemConfrimPrompt songIds={[songId]} />);
          toggleMultipleSelections(false);
        }
      }
    ];
  }, [
    addNewNotifications,
    changePromptMenuData,
    currentSongData,
    gotToSongAlbumPage,
    preferences?.doNotShowBlacklistSongConfirm,
    showSongInfoPage,
    t,
    toggleMultipleSelections
  ]);

  return (
    <div className="current-playing-song-info-container grid w-full max-w-full grid-cols-[6rem_minmax(0,1fr)] items-center gap-2 lg:grid-cols-[minmax(0,1fr)]">
      <div
        className="song-cover-container group relative flex aspect-square h-full cursor-pointer items-center justify-center p-2 [perspective:1000px] lg:hidden"
        id="currentSongCover"
        onClick={toggleRewindReveal}
        title={
          isCreditsRevealed
            ? t('player.flipToFront', 'Click to flip cover')
            : t('player.flipToCredits', 'Click to reveal liner notes')
        }
      >
        <div className={`fx-flip-inner h-full w-full ${isCreditsRevealed ? 'fx-flipped' : ''}`}>
          <div className="fx-flip-face h-full w-full">
            <Img
              className={`aspect-square h-full max-w-full rounded-lg object-cover object-center shadow-xl transition-transform duration-500 ${
                isCurrentSongPlaying ? 'fx-art-pulse' : 'fx-art-pulse--paused'
              }`}
              src={currentSongData.artworkPath}
              fallbackSrc={DefaultSongCover}
              alt="Default song cover"
              onContextMenu={(e) => {
                e.stopPropagation();
                updateContextMenuData(
                  true,
                  contextMenuItems,
                  e.pageX,
                  e.pageY,
                  contextMenuCurrentSongData
                );
              }}
            />
            {/* Subtle flip indicator on hover */}
            <div className="pointer-events-none absolute right-1 bottom-1 flex items-center gap-0.5 rounded bg-black/60 px-1 py-0.5 text-[9px] text-white/90 opacity-0 backdrop-blur-xs transition-opacity group-hover:opacity-100">
              <span className="material-icons-round text-[11px]">flip</span>
            </div>
          </div>
          <div
            className="fx-flip-face fx-flip-back absolute inset-0 flex flex-col justify-between overflow-hidden rounded-lg border border-blue-500/50 bg-slate-900/95 p-2.5 text-slate-200 shadow-2xl select-none dark:bg-slate-900/95"
            aria-hidden={!isCreditsRevealed}
          >
            <div className="flex items-center justify-between border-b border-slate-700/60 pb-1">
              <span className="text-[9px] font-bold tracking-widest text-blue-400 uppercase">
                Liner Notes
              </span>
              <span className="font-mono text-[9px] text-slate-400">{songDurationLabel}</span>
            </div>
            <div className="flex flex-col justify-center gap-0.5 overflow-hidden py-1">
              <span
                className="truncate text-xs font-semibold text-white"
                title={currentSongData.title}
              >
                {currentSongData.title}
              </span>
              <span className="truncate text-[11px] text-slate-300">
                {currentSongData.artists?.map((a) => a.name).join(', ') ||
                  t('common.unknownArtist')}
              </span>
              {currentSongData.album?.name && (
                <span className="truncate text-[10px] text-slate-400 italic">
                  {currentSongData.album.name}
                </span>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-slate-700/60 pt-1 font-mono text-[9px] text-emerald-400">
              <span>{currentSongData.year ? `Year: ${currentSongData.year}` : 'Stereo'}</span>
              <span className="text-slate-400">Flip ↻</span>
            </div>
          </div>
        </div>
      </div>
      <div className="song-info-container relative flex h-full w-full flex-col items-start justify-center drop-shadow-lg lg:ml-4 lg:w-full">
        {currentSongData.title && (
          <div className="song-title flex w-full items-center">
            <NavLink
              to="/main-player/songs/$songId"
              params={{ songId: String(currentSongData.songId) }}
              className={`text-font-color-highlight w-fit max-w-full cursor-pointer overflow-hidden text-2xl font-medium text-ellipsis whitespace-nowrap outline-offset-1 focus-visible:outline! ${
                currentSongData.isKnownSource && 'hover:underline'
              }`}
              disabled={!currentSongData.isKnownSource}
              id="currentSongTitle"
              title={currentSongData.title}
              onContextMenu={(e) => {
                e.stopPropagation();
                updateContextMenuData(
                  true,
                  contextMenuItems,
                  e.pageX,
                  e.pageY,
                  contextMenuCurrentSongData
                );
              }}
              tabIndex={0}
            >
              {currentSongData.title}
            </NavLink>
            {!currentSongData.isKnownSource && (
              <span
                className="material-icons-round-outlined text-font-color-highlight dark:text-dark-font-color-highlight ml-2 cursor-pointer text-xl font-light hover:underline"
                title="You are playing from an unknown source. Some features are disabled."
              >
                error
              </span>
            )}
          </div>
        )}
        {!isNextSongPopupVisible && (
          <div
            className="song-artists appear-from-bottom flex w-full items-center truncate"
            id="currentSongArtists"
          >
            {preferences?.showArtistArtworkNearSongControls &&
              songArtistsImages &&
              songArtistsImages.length > 0 && (
                <span
                  className={`relative mr-2 flex h-6 items-center lg:hidden ${
                    songArtistsImages.length === 1 ? 'w-6' : 'w-10'
                  } `}
                >
                  {songArtistsImages}
                </span>
              )}
            <span className="text-font-color-black/90 dark:text-font-color-white/90 flex w-3/4 grow-0 text-xs">
              {songArtists}
            </span>
          </div>
        )}
        <UpNextSongPopup onPopupAppears={(isVisible) => setIsNextSongPopupVisible(isVisible)} />
      </div>
    </div>
  );
};

export default CurrentlyPlayingSongInfoContainer;
