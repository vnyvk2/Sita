import FloatingLyricsSnapBackBtn from '@renderer/components/LyricsPage/FloatingLyricsSnapBackBtn';
import LyricsAmbientBackground from '@renderer/components/LyricsPage/LyricsAmbientBackground';
import { renderLyricsLines } from '@renderer/components/LyricsPage/lyricsUtils';
import NoLyrics from '@renderer/components/LyricsPage/NoLyrics';
import { useActiveLyricIndex } from '@renderer/components/LyricsPage/useActiveLyricIndex';
import { useLyricsScrollSync } from '@renderer/components/LyricsPage/useLyricsScrollSync';
import useSkipLyricsLines from '@renderer/hooks/useSkipLyricsLines';
import { useLyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useMemo, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

export const LyricsPanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data: lyrics, isPending: isLoadingLyrics } = useLyricsQuery({
    enabled: Boolean(currentSongData.songId)
  });

  useSkipLyricsLines(lyrics);

  const isSynced = Boolean(lyrics?.lyrics?.isSynced);
  const activeLineIndex = useActiveLyricIndex(lyrics ?? null);

  const {
    scrollMode,
    isAutoScrolling,
    direction,
    showSnapBack,
    handleSnapBack,
    handleToggleScrollMode
  } = useLyricsScrollSync({
    containerRef: scrollContainerRef,
    activeLineIndex,
    isSynced,
    songId: currentSongData.songId,
    parsedLyrics: lyrics?.lyrics?.parsedLyrics ?? null,
    offset: lyrics?.lyrics?.offset ?? 0
  });

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      isAutoScrolling,
      'drawer',
      activeLineIndex,
      abLoop,
      false
    );
  }, [currentSongData.duration, isAutoScrolling, lyrics, activeLineIndex, abLoop]);

  const handleExpandToPage = () => {
    navigate({
      to: '/main-player/lyrics',
      search: { from: '/main-player' }
    });
  };

  const hasLyrics = lyricsComponents.length > 0;

  return (
    <div className="lyrics-panel bg-background-color-1 dark:bg-dark-background-color-1 text-font-color-black dark:text-font-color-white relative flex h-full w-full flex-col overflow-hidden">
      {/* Dynamic Ambient Artwork Background */}
      {preferences?.lyricsBackground === 'artwork' && currentSongData.artworkPath && (
        <LyricsAmbientBackground
          artworkPath={
            currentSongData.artworkPaths?.optimizedArtworkPath ?? currentSongData.artworkPath
          }
          paletteData={currentSongData.paletteData}
        />
      )}

      {/* Sub-header with track name, scroll mode toggle, and full-page expand */}
      <div className="bg-background-color-2/30 dark:bg-dark-background-color-2/30 relative z-10 flex shrink-0 items-center justify-between border-b border-stone-200/50 px-2.5 py-1.5 dark:border-stone-800/50">
        <div className="flex min-w-0 flex-col pr-2">
          <span className="text-font-color-black dark:text-font-color-white truncate text-[11px] font-semibold">
            {currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}
          </span>
          <span className="text-font-color-dimmed truncate text-[10px]">
            {Array.isArray(currentSongData.artists)
              ? currentSongData.artists.map((a) => a.name).join(', ')
              : ''}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Scroll Mode Toggle */}
          {isSynced && (
            <button
              type="button"
              onClick={handleToggleScrollMode}
              aria-pressed={scrollMode === 'auto'}
              title={
                scrollMode === 'auto'
                  ? t('lyricsPage.switchToManualScroll', 'Switch to manual scroll')
                  : t('lyricsPage.switchToAutoScroll', 'Switch to auto-scroll')
              }
              className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
                scrollMode === 'auto'
                  ? 'text-accent hover:bg-stone-200 dark:hover:bg-stone-700'
                  : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              <span className="material-symbols-rounded text-sm">
                {scrollMode === 'auto' ? 'swap_vert' : 'swipe_up'}
              </span>
            </button>
          )}

          {/* Expand to full page */}
          <button
            type="button"
            onClick={handleExpandToPage}
            title={t('lyricsPage.expandToFullPage', 'Expand to full page')}
            className="text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-stone-200 dark:hover:bg-stone-700"
          >
            <span className="material-symbols-rounded text-sm">open_in_new</span>
          </button>
        </div>
      </div>

      {/* Lyrics lines stream */}
      <div
        ref={scrollContainerRef}
        className="relative z-10 flex-1 overflow-x-hidden overflow-y-auto p-4"
      >
        {isLoadingLyrics ? (
          <div className="text-font-color-dimmed flex h-full w-full items-center justify-center p-6 text-center">
            <span className="material-symbols-rounded mb-2 animate-spin text-2xl">
              progress_activity
            </span>
          </div>
        ) : hasLyrics ? (
          <div className="lyrics-container flex flex-col items-center py-6 text-center">
            {lyricsComponents}
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <NoLyrics
              iconName="release_alert"
              title={t('lyricsPage.noLyrics', 'No lyrics available')}
              description={t(
                'lyricsPage.noLyricsDescription',
                'Could not find lyrics for this track.'
              )}
            />
          </div>
        )}
      </div>

      {/* Floating bidirectional snap-back button */}
      {showSnapBack && direction && (
        <FloatingLyricsSnapBackBtn
          direction={direction}
          onClick={handleSnapBack}
          className={direction === 'up' ? 'top-11' : 'bottom-4'}
        />
      )}
    </div>
  );
});

LyricsPanel.displayName = 'LyricsPanel';
export default LyricsPanel;
