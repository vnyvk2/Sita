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
import { memo, useCallback, useMemo, useRef, type FC } from 'react';
import { useTranslation } from 'react-i18next';

import { PanelHeaderSlot } from '../../engine/PanelHeaderSlot';
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

  const artistsString = useMemo(() => {
    return Array.isArray(currentSongData.artists)
      ? currentSongData.artists.map((a) => a.name).join(', ')
      : '';
  }, [currentSongData.artists]);

  const handleExpandToPage = useCallback(() => {
    navigate({
      to: '/main-player/lyrics',
      search: { from: '/main-player' }
    });
  }, [navigate]);

  const hasLyrics = lyricsComponents.length > 0;

  const headerInfo = useMemo(
    () => (
      <span
        className="truncate text-[11px]"
        title={`${currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}${artistsString ? ` — ${artistsString}` : ''}`}
      >
        <span className="text-font-color-black dark:text-font-color-white font-semibold">
          {currentSongData.title || t('lyricsPage.noSongPlaying', 'No track selected')}
        </span>
        {artistsString && <span className="text-font-color-dimmed"> — {artistsString}</span>}
      </span>
    ),
    [currentSongData.title, artistsString, t]
  );

  const scrollToggleLabel =
    scrollMode === 'auto'
      ? t('lyricsPage.switchToManualScroll', 'Switch to manual scroll')
      : t('lyricsPage.switchToAutoScroll', 'Switch to auto-scroll');

  const headerActions = useMemo(
    () =>
      isSynced ? (
        <button
          type="button"
          onClick={handleToggleScrollMode}
          aria-pressed={scrollMode === 'auto'}
          aria-label={scrollToggleLabel}
          title={scrollToggleLabel}
          className={`flex h-4.5 w-4.5 shrink-0 cursor-pointer items-center justify-center rounded transition-colors ${
            scrollMode === 'auto'
              ? 'text-accent bg-accent/15 hover:bg-accent/25 dark:bg-accent/20 dark:hover:bg-accent/30 font-semibold'
              : 'text-font-color-dimmed/70 hover:text-font-color-black dark:hover:text-font-color-white hover:bg-stone-200/60 dark:hover:bg-stone-700/60'
          }`}
        >
          <span className="material-symbols-rounded-outlined text-[12px] leading-none">
            {scrollMode === 'auto' ? 'swap_vert' : 'swipe_up'}
          </span>
        </button>
      ) : null,
    [isSynced, handleToggleScrollMode, scrollMode, scrollToggleLabel]
  );

  const headerMenu = useCallback(
    () => [
      ...(isSynced
        ? [
            {
              label: scrollToggleLabel,
              icon: scrollMode === 'auto' ? 'swap_vert' : 'swipe_up',
              handler: handleToggleScrollMode
            }
          ]
        : []),
      {
        label: t('lyricsPage.expandToFullPage', 'Expand to full page'),
        icon: 'open_in_new',
        handler: handleExpandToPage
      }
    ],
    [isSynced, scrollToggleLabel, scrollMode, handleToggleScrollMode, handleExpandToPage, t]
  );

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

      <PanelHeaderSlot info={headerInfo} actions={headerActions} menu={headerMenu} />

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
          className={direction === 'up' ? 'top-2' : 'bottom-4'}
        />
      )}
    </div>
  );
});

LyricsPanel.displayName = 'LyricsPanel';
export default LyricsPanel;
