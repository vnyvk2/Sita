import { store } from '@renderer/store/store';
import storage from '@renderer/utils/localStorage';
import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import { useLyricsQuery } from '../../../queries/lyrics';
import LyricsMetadata from '../../LyricsPage/LyricsMetadata';
import { renderLyricsLines } from '../../LyricsPage/lyricsUtils';
import { useActiveLyricIndex } from '../../LyricsPage/useActiveLyricIndex';

type Props = { isLyricsVisible: boolean };

const LyricsContainer = (props: Props) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const { t } = useTranslation();

  const { isLyricsVisible } = props;

  const scrollMode = preferences?.lyricsScrollMode ?? 'auto';
  const isAutoScrolling = scrollMode === 'auto';

  const { data: lyrics } = useLyricsQuery({ enabled: isLyricsVisible });
  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(
      lyrics,
      currentSongData.duration,
      isAutoScrolling,
      'mini',
      activeLineIndex,
      abLoop
    );
  }, [lyrics, currentSongData.duration, isAutoScrolling, activeLineIndex, abLoop]);

  const handleToggleScrollMode = useCallback(() => {
    const next = scrollMode === 'auto' ? 'manual' : 'auto';
    storage.preferences.setPreferences('lyricsScrollMode', next);
  }, [scrollMode]);

  // --- Floating snap-back button logic ---
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showSnapBack, setShowSnapBack] = useState(false);
  const userScrolledRef = useRef(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleUserScroll = () => {
      userScrolledRef.current = true;
      setShowSnapBack(true);

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

  useEffect(() => {
    if (isAutoScrolling && !userScrolledRef.current) {
      setShowSnapBack(false);
    }
  }, [activeLineIndex, isAutoScrolling]);

  const handleSnapBack = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container || activeLineIndex == null) return;

    const activeLine =
      container.querySelector('[data-active-line="true"]') ??
      container.querySelectorAll('.highlight')[activeLineIndex === -1 ? 0 : activeLineIndex + 1];

    if (activeLine) {
      activeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    userScrolledRef.current = false;
    setShowSnapBack(false);
  }, [activeLineIndex]);

  const lyricsSource = useMemo(() => {
    if (lyrics && lyrics?.lyrics) {
      const { source, link } = lyrics;

      return (
        <LyricsMetadata
          source={source}
          copyright={lyrics.lyrics.copyright}
          link={link}
          className="mt-2!"
          textClassName="text-xs!"
        />
      );
    }
    return undefined;
  }, [lyrics]);

  const isSynced = Boolean(lyrics?.lyrics?.isSynced);

  return (
    <div
      className={`absolute inset-0 z-20 transition-all duration-200 select-none ${
        isLyricsVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Scroll Mode Toggle (Top-Left corner of mini player lyrics) */}
      {isLyricsVisible && isSynced && lyricsComponents.length > 0 && (
        <button
          type="button"
          onClick={handleToggleScrollMode}
          title={
            isAutoScrolling
              ? t('lyricsPage.switchToManualScroll', 'Switch to manual scroll')
              : t('lyricsPage.switchToAutoScroll', 'Switch to auto-scroll')
          }
          className={`[-webkit-app-region:no-drag] absolute top-2.5 left-2.5 z-40 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/50 backdrop-blur-md transition-colors ${
            isAutoScrolling
              ? 'text-accent hover:bg-black/70'
              : 'text-font-color-white/70 hover:bg-black/70 hover:text-white'
          }`}
        >
          <span className="material-symbols-rounded text-sm">
            {isAutoScrolling ? 'swap_vert' : 'swipe_up'}
          </span>
        </button>
      )}

      {/* Main lyrics scroll container */}
      <div
        ref={scrollContainerRef}
        className="mini-player-lyrics-container flex h-full w-full flex-col items-center overflow-x-hidden overflow-y-auto px-4 py-12 select-none"
        id="miniPlayerLyricsContainer"
      >
        {isLyricsVisible && lyricsComponents.length > 0 && lyrics && (
          <>
            {lyricsComponents}
            {lyricsSource}
          </>
        )}
        {isLyricsVisible && lyrics && lyricsComponents.length === 0 && (
          <div className="text-font-color-white flex h-full w-full items-center justify-center opacity-75">
            {t('lyricsPage.noLyrics')}
          </div>
        )}
        {isLyricsVisible && lyrics === undefined && (
          <div className="text-font-color-white flex h-full w-full items-center justify-center">
            {t('lyricsPage.noLyrics')}
          </div>
        )}
      </div>

      {/* Floating snap-back button */}
      {isLyricsVisible &&
        !isAutoScrolling &&
        isSynced &&
        lyricsComponents.length > 0 &&
        showSnapBack &&
        activeLineIndex != null && (
          <button
            type="button"
            onClick={handleSnapBack}
            title={t('lyricsPage.scrollToCurrentLine', 'Scroll to current line')}
            className="bg-accent [-webkit-app-region:no-drag] absolute bottom-4 left-1/2 z-40 flex -translate-x-1/2 cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md transition-all hover:scale-105 hover:shadow-2xl active:scale-95"
          >
            <span className="material-symbols-rounded text-base">keyboard_double_arrow_down</span>
            <span>{t('lyricsPage.currentLine', 'Current line')}</span>
          </button>
        )}
    </div>
  );
};

export default LyricsContainer;
