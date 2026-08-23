import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import { useLyricsQuery } from '../../../queries/lyrics';
import { renderLyricsLines } from '../../LyricsPage/lyricsUtils';
import { useActiveLyricIndex } from '../../LyricsPage/useActiveLyricIndex';
import LyricsMetadata from '../../LyricsPage/LyricsMetadata';

type Props = {
  isLyricsVisible: boolean;
  setIsLyricsAvailable: (state: boolean) => void;
};

const LyricsContainer = (props: Props) => {
  const isCurrentSongPlaying = useStore(store, (state) => state.player.isCurrentSongPlaying);
  const currentSongData = useStore(store, (state) => state.currentSongData);

  const { isLyricsVisible, setIsLyricsAvailable } = props;
  const { t } = useTranslation();

  const { data: lyrics } = useLyricsQuery({ enabled: isLyricsVisible });
  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);

  useEffect(() => {
    if (isLyricsVisible && lyrics) {
      setIsLyricsAvailable(true);
    }
  }, [isLyricsVisible, lyrics, setIsLyricsAvailable]);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(lyrics, currentSongData.duration, true, 'full', activeLineIndex);
  }, [lyrics, currentSongData.duration, activeLineIndex]);

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

  return (
    <div
      className={`mini-player-lyrics-container appear-from-bottom w-ful absolute top-0 flex h-full max-h-screen! w-full max-w-full! flex-col items-start overflow-auto pt-20 pr-[20%] pb-[25%] pl-20 transition-[filter] delay-200 select-none group-focus-within:brightness-50 group-focus-within/fullScreenPlayer:blur-xs group-hover/fullScreenPlayer:blur-xs group-hover/fullScreenPlayer:brightness-50 ${
        !isCurrentSongPlaying ? 'blur-xs brightness-50' : ''
      }`}
      id="miniPlayerLyricsContainer"
    >
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
    </div>
  );
};

export default LyricsContainer;
