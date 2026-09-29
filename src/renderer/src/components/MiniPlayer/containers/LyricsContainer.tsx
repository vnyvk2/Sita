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

  const { isAutoScrolling, direction, showSnapBack, handleSnapBack } = useLyricsScrollSync({
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
      ref={scrollContainerRef}
      className={`mini-player-lyrics-container absolute inset-0 z-20 flex flex-col items-center overflow-x-hidden overflow-y-auto px-4 py-12 transition-all duration-200 select-none ${
        isLyricsVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
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

      {/* Snap-back pill — inside the scroll container so it doesn't block window controls */}
      {showSnapBack && direction && (
        <FloatingLyricsSnapBackBtn
          direction={direction}
          onClick={handleSnapBack}
          className={`sticky ${direction === 'up' ? 'top-0' : 'bottom-0'}`}
        />
      )}
    </div>
  );
};

export default LyricsContainer;
