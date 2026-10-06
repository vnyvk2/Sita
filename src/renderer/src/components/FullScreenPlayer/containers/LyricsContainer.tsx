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

type Props = {
  isLyricsVisible: boolean;
  className?: string;
};

const LyricsContainer = (props: Props) => {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const abLoop = useStore(store, (state) => state.player.abLoop);

  const { isLyricsVisible, className } = props;
  const { t } = useTranslation();

  const { data: lyrics } = useLyricsQuery({ enabled: isLyricsVisible });
  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);
  const isSynced = Boolean(lyrics?.lyrics?.isSynced);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

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
      'full',
      activeLineIndex,
      abLoop,
      false
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
          className="items-start! text-left!"
        />
      );
    }
    return undefined;
  }, [lyrics]);

  const containerClasses =
    className ||
    `mini-player-lyrics-container appear-from-bottom absolute top-0 flex h-full max-h-screen! w-full max-w-full! flex-col items-start overflow-auto pt-20 pr-[20%] pb-[25%] pl-20 transition-[filter] delay-200 select-none ${
      !isCurrentSongPlaying ? 'blur-xs brightness-50' : ''
    }`;

  return (
    <div ref={scrollContainerRef} className={containerClasses} id="miniPlayerLyricsContainer">
      {isLyricsVisible && lyrics?.lyrics?.isSynced && (
        <button
          type="button"
          onClick={handleToggleScrollMode}
          aria-pressed={scrollMode === 'auto'}
          title={
            scrollMode === 'auto'
              ? t('lyricsPage.switchToManualScroll', 'Switch to manual scroll')
              : t('lyricsPage.switchToAutoScroll', 'Switch to auto-scroll')
          }
          className="absolute top-4 right-4 z-30 flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-black/30 text-white shadow-md backdrop-blur-md transition-all hover:bg-black/50"
        >
          <span className="material-icons-round text-xl">
            {scrollMode === 'auto' ? 'flash_off' : 'flash_on'}
          </span>
        </button>
      )}
      {isLyricsVisible && lyricsComponents.length > 0 && lyrics && lyrics.lyrics.isSynced && (
        <>
          {lyricsComponents}
          {lyricsSource}
        </>
      )}
      {isLyricsVisible && lyrics && !lyrics.lyrics.isSynced && (
        <div className="text-font-color-highlight flex h-full w-full flex-col justify-center text-2xl opacity-50">
          <span className="material-icons-round-outlined mb-2 text-5xl">brightness_alert</span>
          {t('lyricsPage.noSyncedLyrics')}
          <p className="mt-4 text-base">{t('lyricsPage.noSyncedLyricsDescription')}</p>
        </div>
      )}
      {isLyricsVisible && lyrics === undefined && (
        <div className="text-font-color-highlight flex h-full w-full flex-col justify-center text-2xl opacity-50">
          <span className="material-icons-round-outlined mb-2 text-5xl">brightness_alert</span>
          <p>{t('lyricsPage.noLyrics')}</p>
          <p className="mt-4 text-base">{t('lyricsPage.noLyricsDescription')}</p>
        </div>
      )}

      {/* Floating bidirectional snap-back button */}
      {showSnapBack && direction && (
        <FloatingLyricsSnapBackBtn
          direction={direction}
          onClick={handleSnapBack}
          className={direction === 'up' ? 'top-24' : 'bottom-8'}
        />
      )}
    </div>
  );
};

export default LyricsContainer;
