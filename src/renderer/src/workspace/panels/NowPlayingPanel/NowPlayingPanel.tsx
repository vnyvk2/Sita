import DefaultSongCover from '@renderer/assets/images/webp/song_cover_default.webp';
import Img from '@renderer/components/Img';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useContext, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

export const NowPlayingPanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const isCurrentSongPlaying = useStore(store, (state) => state.isCurrentSongPlaying);

  const { toggleSongPlayback, handleSkipBackwardClick, handleSkipForwardClick, toggleIsFavorite } =
    useContext(AppUpdateContext);

  const handleArtistClick = useCallback(
    (artistId: number) => {
      navigate({
        to: '/main-player/artists/$artistId',
        params: { artistId: String(artistId) }
      });
    },
    [navigate]
  );

  const handleAlbumClick = useCallback(() => {
    if (currentSongData.album?.albumId) {
      navigate({
        to: '/main-player/albums/$albumId',
        params: { albumId: String(currentSongData.album.albumId) }
      });
    }
  }, [currentSongData.album, navigate]);

  const fileExt = currentSongData.path
    ? (currentSongData.path.split('.').pop()?.toUpperCase() ?? '')
    : '';

  const isFavorite = Boolean(currentSongData.isAFavorite);

  const handleToggleFav = useCallback(() => {
    toggleIsFavorite(!isFavorite);
  }, [isFavorite, toggleIsFavorite]);

  if (!currentSongData.songId) {
    return (
      <div className="now-playing-panel text-font-color-dimmed bg-background-color-1 dark:bg-dark-background-color-1 flex h-full w-full flex-col items-center justify-center p-6 text-center">
        <span className="material-symbols-rounded mb-2 text-4xl opacity-50">album</span>
        <p className="text-xs">{t('player.noSongSelected', 'No track selected')}</p>
      </div>
    );
  }

  const artworkSrc =
    currentSongData.artworkPaths?.artworkPath ?? currentSongData.artworkPath ?? DefaultSongCover;

  return (
    <div className="now-playing-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white flex h-full w-full flex-col items-center justify-between overflow-x-hidden overflow-y-auto p-5">
      {/* Artwork Section */}
      <div className="flex max-h-[340px] min-h-[160px] w-full flex-1 items-center justify-center">
        <div className="group relative aspect-square w-full max-w-[280px] overflow-hidden rounded-2xl shadow-xl transition-transform hover:scale-[1.02]">
          <Img
            src={artworkSrc}
            fallbackSrc={DefaultSongCover}
            loading="eager"
            className="h-full w-full object-cover"
            alt=""
          />

          {fileExt && (
            <div className="absolute top-2 right-2 rounded-md bg-stone-900/80 px-2 py-0.5 text-[10px] font-bold text-white shadow-md backdrop-blur-sm">
              {fileExt}
            </div>
          )}
        </div>
      </div>

      {/* Track Metadata Section */}
      <div className="my-3 flex w-full flex-col items-center text-center">
        <h2 className="text-font-color-black dark:text-font-color-white max-w-full truncate text-base font-bold">
          {currentSongData.title}
        </h2>

        {/* Artists */}
        <div className="text-font-color-dimmed mt-1 flex flex-wrap items-center justify-center gap-1 text-xs">
          {Array.isArray(currentSongData.artists) && currentSongData.artists.length > 0 ? (
            currentSongData.artists.map((artist, idx) => (
              <span key={artist.artistId} className="flex items-center">
                <button
                  type="button"
                  onClick={() => handleArtistClick(artist.artistId)}
                  className="hover:text-accent cursor-pointer hover:underline"
                >
                  {artist.name}
                </button>
                {idx < (currentSongData.artists?.length ?? 0) - 1 && (
                  <span className="mr-1">,</span>
                )}
              </span>
            ))
          ) : (
            <span>Unknown Artist</span>
          )}
        </div>

        {/* Album */}
        {currentSongData.album && (
          <button
            type="button"
            onClick={handleAlbumClick}
            className="text-font-color-dimmed/80 hover:text-font-color-black dark:hover:text-font-color-white mt-1 max-w-full cursor-pointer truncate text-[11px] hover:underline"
          >
            {currentSongData.album.name}
          </button>
        )}
      </div>

      {/* Mini Controls & Actions */}
      <div className="flex shrink-0 items-center justify-center gap-3">
        {/* Favorite */}
        <button
          type="button"
          onClick={handleToggleFav}
          title={
            isFavorite
              ? t('player.removeFromFavorites', 'Remove from favorites')
              : t('player.addToFavorites', 'Add to favorites')
          }
          className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-colors ${
            isFavorite
              ? 'text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950/40'
              : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200/60 dark:hover:bg-stone-800/60'
          }`}
        >
          <span className={`material-symbols-rounded text-xl ${isFavorite ? 'fill-current' : ''}`}>
            favorite
          </span>
        </button>

        {/* Prev */}
        <button
          type="button"
          onClick={handleSkipBackwardClick}
          title={t('player.prevTrack', 'Previous')}
          className="text-font-color-black dark:text-font-color-white flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
        >
          <span className="material-symbols-rounded text-2xl">skip_previous</span>
        </button>

        {/* Play/Pause */}
        <button
          type="button"
          onClick={toggleSongPlayback}
          title={isCurrentSongPlaying ? t('player.pause', 'Pause') : t('player.play', 'Play')}
          className="bg-accent flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white shadow-md transition-transform hover:scale-105 active:scale-95"
        >
          <span className="material-symbols-rounded text-2xl">
            {isCurrentSongPlaying ? 'pause' : 'play_arrow'}
          </span>
        </button>

        {/* Next */}
        <button
          type="button"
          onClick={() => handleSkipForwardClick('user-skip')}
          title={t('player.nextTrack', 'Next')}
          className="text-font-color-black dark:text-font-color-white flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-stone-200/60 dark:hover:bg-stone-800/60"
        >
          <span className="material-symbols-rounded text-2xl">skip_next</span>
        </button>
      </div>
    </div>
  );
});

NowPlayingPanel.displayName = 'NowPlayingPanel';
export default NowPlayingPanel;
