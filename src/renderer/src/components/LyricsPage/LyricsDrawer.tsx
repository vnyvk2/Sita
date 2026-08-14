import Button from '@renderer/components/Button';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSkipLyricsLines from '@renderer/hooks/useSkipLyricsLines';
import { lyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import LyricsAmbientBackground from './LyricsAmbientBackground';
import LyricsMetadata from './LyricsMetadata';
import NoLyrics from './NoLyrics';
import { renderLyricsLines } from './lyricsUtils';

const LyricsDrawer = () => {
  const isLyricsDrawerOpen = useStore(store, (state) => state.isLyricsDrawerOpen);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { toggleLyricsDrawer } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const isLyricsPage = location.pathname.startsWith('/main-player/lyrics');

  const { data: lyrics, isPending: isLoadingLyrics } = useQuery({
    ...lyricsQuery.single({
      title: currentSongData.title,
      artists: Array.isArray(currentSongData.artists)
        ? currentSongData.artists.map((artist) => artist.name)
        : [],
      album: currentSongData.album?.name,
      path: currentSongData.path,
      duration: currentSongData.duration,
      lyricsType: 'ANY',
      lyricsRequestType: 'ANY',
      saveLyricsAutomatically: preferences.lyricsAutomaticallySaveState
    }),
    enabled: isLyricsDrawerOpen && !isLyricsPage,
    staleTime: Infinity
  });

  useSkipLyricsLines(lyrics);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(lyrics, currentSongData.duration, true, 'normal');
  }, [currentSongData.duration, lyrics]);

  const handleExpandClick = () => {
    const fromPath = location.pathname + (location.searchStr ? `?${location.searchStr}` : '');
    toggleLyricsDrawer(false);
    navigate({
      to: '/main-player/lyrics',
      search: { from: fromPath }
    });
  };

  // Do not render the drawer if closed or already on the central lyrics page
  if (!isLyricsDrawerOpen || isLyricsPage) {
    return null;
  }

  const isSynced = lyrics?.lyrics?.isSynced;
  const copyright = lyrics?.lyrics?.copyright;

  return (
    <aside
      className="lyrics-drawer relative z-20 flex h-full w-96 min-w-[320px] max-w-[35vw] flex-col overflow-hidden border-l border-background-color-2 bg-background-color-1/95 backdrop-blur-xl transition-all duration-300 dark:border-dark-background-color-2 dark:bg-dark-background-color-1/95"
      aria-label={t('player.lyrics', 'Lyrics')}
    >
      {/* Ambient Artwork Background */}
      {preferences?.lyricsBackground === 'artwork' && currentSongData.artworkPath && (
        <LyricsAmbientBackground
          artworkPath={currentSongData.artworkPath}
          blur={preferences.lyricsArtworkBlur}
          darkness={preferences.lyricsArtworkDarkness}
          enableAnimation={preferences.lyricsArtworkAnimation}
          reducedMotion={preferences.isReducedMotion}
        />
      )}

      {/* Drawer Header */}
      <div className="relative z-10 flex items-center justify-between border-b border-background-color-2/40 px-4 py-3 dark:border-dark-background-color-2/40">
        <div className="flex min-w-0 flex-1 flex-col pr-2">
          <span className="truncate text-sm font-semibold text-font-color-black dark:text-font-color-white">
            {currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}
          </span>
          <span className="truncate text-xs text-font-color-dimmed dark:text-dark-font-color-dimmed">
            {Array.isArray(currentSongData.artists)
              ? currentSongData.artists.map((a) => a.name).join(', ')
              : ''}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            className="expand-to-page-btn m-0! flex h-8 w-8 items-center justify-center rounded-md! border-0! bg-transparent p-0! hover:bg-background-color-2 dark:hover:bg-dark-background-color-2"
            iconName="open_in_full"
            iconClassName="material-icons-round text-lg text-font-color-black dark:text-font-color-white opacity-70 hover:opacity-100"
            tooltipLabel={t('lyricsPage.expandToFullPage', 'Expand to full page')}
            clickHandler={handleExpandClick}
          />
          <Button
            className="close-drawer-btn m-0! flex h-8 w-8 items-center justify-center rounded-md! border-0! bg-transparent p-0! hover:bg-background-color-2 dark:hover:bg-dark-background-color-2"
            iconName="close"
            iconClassName="material-icons-round text-lg text-font-color-black dark:text-font-color-white opacity-70 hover:opacity-100"
            tooltipLabel={t('common.close', 'Close')}
            clickHandler={() => toggleLyricsDrawer(false)}
          />
        </div>
      </div>

      {/* Lyrics Stream */}
      <div className="lyrics-lines-container relative z-10 flex min-h-0 flex-1 w-full scrollbar-gutter-stable flex-col items-center overflow-y-auto px-4 py-6 [overflow-anchor:none]!">
        {isLoadingLyrics && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-font-color-highlight border-t-transparent dark:border-dark-font-color-highlight" />
          </div>
        )}

        {!isLoadingLyrics && lyricsComponents.length > 0 && (
          <>
            {lyricsComponents}
            {lyrics && (
              <LyricsMetadata
                source={lyrics.source}
                link={lyrics.link}
                copyright={copyright}
                isTranslated={lyrics.lyrics.isTranslated}
              />
            )}
          </>
        )}

        {!isLoadingLyrics && lyricsComponents.length === 0 && (
          <NoLyrics isSyncedLyrics={isSynced} />
        )}
      </div>
    </aside>
  );
};

export default LyricsDrawer;
