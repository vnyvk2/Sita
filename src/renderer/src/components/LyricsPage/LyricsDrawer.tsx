import Button from '@renderer/components/Button';
import { AppUpdateContext } from '@renderer/contexts/AppUpdateContext';
import useSkipLyricsLines from '@renderer/hooks/useSkipLyricsLines';
import { useLyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import { useLocation, useNavigate, useRouter } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { useContext, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import LyricsAmbientBackground from './LyricsAmbientBackground';
import LyricsMetadata from './LyricsMetadata';
import { renderLyricsLines } from './lyricsUtils';
import NoLyrics from './NoLyrics';
import { useActiveLyricIndex } from './useActiveLyricIndex';

const LyricsDrawer = () => {
  const isLyricsDrawerOpen = useStore(store, (state) => state.isLyricsDrawerOpen);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const { toggleLyricsDrawer } = useContext(AppUpdateContext);
  const { t } = useTranslation();
  const navigate = useNavigate();
  const router = useRouter();

  const isLyricsPage = useLocation({
    select: (loc) => loc.pathname.startsWith('/main-player/lyrics')
  });

  const { data: lyrics, isPending: isLoadingLyrics } = useLyricsQuery({
    enabled: isLyricsDrawerOpen && !isLyricsPage
  });

  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsDrawerOpen ? lyrics : null);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      true,
      'drawer',
      activeLineIndex,
      abLoop
    );
  }, [currentSongData.duration, lyrics, activeLineIndex, abLoop]);

  const handleExpandClick = () => {
    const loc = router.state.location;
    const fromPath = loc.pathname + (loc.searchStr ? `?${loc.searchStr}` : '');
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

  const copyright = lyrics?.lyrics?.copyright;

  return (
    <aside
      className="lyrics-drawer border-background-color-2 bg-background-color-1/95 dark:border-dark-background-color-2 dark:bg-dark-background-color-1/95 relative z-20 order-3 flex h-full w-96 max-w-[35vw] min-w-[320px] shrink-0 flex-col overflow-hidden border-l backdrop-blur-xl transition-all duration-300"
      aria-label={t('player.lyrics', 'Lyrics')}
    >
      {/* Ambient Artwork Background */}
      {preferences?.lyricsBackground === 'artwork' && currentSongData.artworkPath && (
        <LyricsAmbientBackground
          artworkPath={
            currentSongData.artworkPaths?.optimizedArtworkPath ?? currentSongData.artworkPath
          }
          paletteData={currentSongData.paletteData}
        />
      )}

      {/* Drawer Header */}
      <div className="border-background-color-2/40 dark:border-dark-background-color-2/40 relative z-10 flex items-center justify-between border-b px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col pr-2">
          <span className="text-font-color-black dark:text-font-color-white truncate text-sm font-semibold">
            {currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}
          </span>
          <span className="text-font-color-dimmed dark:text-dark-font-color-dimmed truncate text-xs">
            {Array.isArray(currentSongData.artists)
              ? currentSongData.artists.map((a) => a.name).join(', ')
              : ''}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <Button
            className="expand-to-page-btn hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 m-0! flex h-8 w-8 items-center justify-center rounded-md! border-0! bg-transparent p-0!"
            iconName="open_in_full"
            iconClassName="material-icons-round text-lg text-font-color-black dark:text-font-color-white opacity-70 hover:opacity-100"
            tooltipLabel={t('lyricsPage.expandToFullPage', 'Expand to full page')}
            clickHandler={handleExpandClick}
          />
          <Button
            className="close-drawer-btn hover:bg-background-color-2 dark:hover:bg-dark-background-color-2 m-0! flex h-8 w-8 items-center justify-center rounded-md! border-0! bg-transparent p-0!"
            iconName="close"
            iconClassName="material-icons-round text-lg text-font-color-black dark:text-font-color-white opacity-70 hover:opacity-100"
            tooltipLabel={t('common.close', 'Close')}
            clickHandler={() => toggleLyricsDrawer(false)}
          />
        </div>
      </div>

      {/* Lyrics Stream */}
      <div className="lyrics-lines-container relative z-10 flex min-h-0 w-full flex-1 flex-col items-center overflow-y-auto px-6 py-8 [overflow-anchor:none]!">
        {isLoadingLyrics && (
          <div className="flex h-full w-full items-center justify-center">
            <div className="border-font-color-highlight dark:border-dark-font-color-highlight h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
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
          <NoLyrics
            iconName="release_alert"
            title={t('lyricsPage.noLyrics', 'No lyrics available')}
            description={t(
              'lyricsPage.noLyricsDescription',
              'Could not find lyrics for this track.'
            )}
          />
        )}
      </div>
    </aside>
  );
};

export default LyricsDrawer;
