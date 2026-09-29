import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import { useLyricsQuery } from '../../../queries/lyrics';
import FloatingLyricsSnapBackBtn from '../../LyricsPage/FloatingLyricsSnapBackBtn';
import LyricsMetadata from '../../LyricsPage/LyricsMetadata';
import { renderLyricsLines } from '../../LyricsPage/lyricsUtils';
import { useActiveLyricIndex } from '../../LyricsPage/useActiveLyricIndex';
import { useLyricsScrollSync } from '../../LyricsPage/useLyricsScrollSync';

type Props = { isLyricsVisible: boolean };

const LyricsContainer = (props: Props) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const { t } = useTranslation();
  const { isLyricsVisible } = props;

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { data: lyrics } = useLyricsQuery({ enabled: isLyricsVisible });
  useSkipLyricsLines(lyrics);

  const isSynced = Boolean(lyrics?.lyrics?.isSynced);
  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);

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
    songId: currentSongData.songId
  });

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

  return (
    <div
      className={`absolute inset-0 z-30 transition-all duration-200 select-none ${
        isLyricsVisible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      {/* Scroll Mode Toggle (Top-Left corner, below the 32px title bar drag region) */}
      {isLyricsVisible && isSynced && lyricsComponents.length > 0 && (
        <button
          type="button"
          onClick={handleToggleScrollMode}
          title={
            scrollMode === 'auto'
              ? t('lyricsPage.switchToManualScroll', 'Switch to manual scroll')
              : t('lyricsPage.switchToAutoScroll', 'Switch to auto-scroll')
          }
          className="[-webkit-app-region:no-drag] absolute top-9.5 left-2.5 z-50 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-black/60 backdrop-blur-md transition-all hover:scale-105 hover:bg-black/80 active:scale-95"
        >
          <span
            className={`material-symbols-rounded text-base ${
              scrollMode === 'auto' ? 'text-accent' : 'text-white/70'
            }`}
          >
            {scrollMode === 'auto' ? 'swap_vert' : 'swipe_up'}
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

      {/* Floating bidirectional snap-back button */}
      {showSnapBack && direction && (
        <FloatingLyricsSnapBackBtn
          direction={direction}
          onClick={handleSnapBack}
          className={direction === 'up' ? 'top-10' : 'bottom-14'}
        />
      )}
    </div>
  );
};

export default LyricsContainer;
