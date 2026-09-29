import LyricsAmbientBackground from '@renderer/components/LyricsPage/LyricsAmbientBackground';
import { renderLyricsLines } from '@renderer/components/LyricsPage/lyricsUtils';
import NoLyrics from '@renderer/components/LyricsPage/NoLyrics';
import { useActiveLyricIndex } from '@renderer/components/LyricsPage/useActiveLyricIndex';
import useSkipLyricsLines from '@renderer/hooks/useSkipLyricsLines';
import { useLyricsQuery } from '@renderer/queries/lyrics';
import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useNavigate } from '@tanstack/react-router';
import { useStore } from '@tanstack/react-store';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import type { PanelProps } from '../../registry';

export const LyricsPanel: FC<PanelProps> = memo(() => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const scrollMode = preferences?.lyricsScrollMode ?? 'auto';
  const isAutoScrolling = scrollMode === 'auto';

  const { data: lyrics, isPending: isLoadingLyrics } = useLyricsQuery({
    enabled: Boolean(currentSongData.songId)
  });

  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(lyrics ?? null);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      isAutoScrolling,
      'drawer',
      activeLineIndex,
      abLoop
    );
  }, [currentSongData.duration, isAutoScrolling, lyrics, activeLineIndex, abLoop]);

  const handleExpandToPage = () => {
    navigate({
      to: '/main-player/lyrics',
      search: { from: '/main-player' }
    });
  };

  const handleToggleScrollMode = useCallback(() => {
    const next = scrollMode === 'auto' ? 'manual' : 'auto';
    storage.preferences.setPreferences('lyricsScrollMode', next);
  }, [scrollMode]);

  // --- Floating snap-back button logic ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showSnapBack, setShowSnapBack] = useState(false);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Detect user-initiated scroll (wheel/touch) to show the snap-back button
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleUserScroll = () => {
      userScrolledRef.current = true;
      setShowSnapBack(true);

      // In auto mode, briefly show snap-back then hide after auto-scroll catches up
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
      if (isAutoScrolling) {
        scrollTimeoutRef.current = setTimeout(() => {
          userScrolledRef.current = false;
          setShowSnapBack(false);
        }, 3000);
      }
    };

    container.addEventListener('wheel', handleUserScroll, { passive: true });
    container.addEventListener('touchmove', handleUserScroll, { passive: true });

    return () => {
      container.removeEventListener('wheel', handleUserScroll);
      container.removeEventListener('touchmove', handleUserScroll);
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, [isAutoScrolling]);

  // Hide snap-back when active line changes in auto mode (auto-scroll caught up)
  useEffect(() => {
    if (isAutoScrolling && !userScrolledRef.current) {
      setShowSnapBack(false);
    }
  }, [activeLineIndex, isAutoScrolling]);

  // Snap-back: scroll to the currently active lyric line
  const handleSnapBack = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || activeLineIndex == null) return;

    // Find the active lyric line element via the highlight/isActive class pattern
    const allLines = container.querySelectorAll('.highlight');
    const activeLine =
      activeLineIndex === -1 ? allLines[0] : allLines[activeLineIndex >= 0 ? activeLineIndex + 1 : 0];

    if (activeLine) {
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    userScrolledRef.current = false;
    setShowSnapBack(false);
  }, [activeLineIndex]);

  const hasLyrics = lyricsComponents.length > 0;
  const isSynced = Boolean(lyrics?.lyrics?.isSynced);

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
              title={
                isAutoScrolling
                  ? t('lyricsPage.switchToManualScroll', 'Switch to manual scroll')
                  : t('lyricsPage.switchToAutoScroll', 'Switch to auto-scroll')
              }
              className={`flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
                isAutoScrolling
                  ? 'text-accent hover:bg-stone-200 dark:hover:bg-stone-700'
                  : 'text-font-color-dimmed hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200 dark:hover:bg-stone-700'
              }`}
            >
              <span className="material-symbols-rounded text-sm">
                {isAutoScrolling ? 'swap_vert' : 'swipe_up'}
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

      {/* Floating snap-back button (Spotify-style) */}
      {!isAutoScrolling && isSynced && hasLyrics && showSnapBack && activeLineIndex != null && (
        <button
          type="button"
          onClick={handleSnapBack}
          title={t('lyricsPage.scrollToCurrentLine', 'Scroll to current line')}
          className="bg-accent absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
        >
          <span className="material-symbols-rounded text-base">keyboard_double_arrow_down</span>
          <span>{t('lyricsPage.currentLine', 'Current line')}</span>
        </button>
      )}
    </div>
  );
});

LyricsPanel.displayName = 'LyricsPanel';
export default LyricsPanel;
