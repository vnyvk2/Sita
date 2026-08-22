import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import i18n from '../../../i18n';
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
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { isLyricsVisible, setIsLyricsAvailable } = props;
  const { t } = useTranslation();

  const [lyrics, setLyrics] = useState<SongLyrics | null | undefined>(null);
  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);

  useEffect(() => {
    let isCurrent = true;
    if (isLyricsVisible) {
      window.api.lyrics
        .getSongLyrics(
          {
            songTitle: currentSongData.title,
            songArtists: Array.isArray(currentSongData.artists)
              ? currentSongData.artists.map((artist) => artist.name)
              : [],
            album: currentSongData.album?.name,
            songPath: currentSongData.path,
            duration: currentSongData.duration
          },
          'ANY',
          'ANY',
          preferences.lyricsAutomaticallySaveState
        )
        .then(async (res) => {
          if (!isCurrent) return undefined;
          if (res) {
            setIsLyricsAvailable(true);
            setLyrics(res);
          }
          if (
            preferences.autoTranslateLyrics &&
            res &&
            !res?.lyrics.isTranslated &&
            !res?.lyrics.isReset &&
            res?.lyrics.originalLanguage !== i18n.language
          ) {
            const translated = await window.api.lyrics.getTranslatedLyrics(
              i18n.language as LanguageCodes
            );
            if (isCurrent && translated) setLyrics(translated);
          }
          if (
            preferences.autoConvertLyrics &&
            res &&
            !res?.lyrics.isReset &&
            !res?.lyrics.isRomanized
          ) {
            let converted: SongLyrics | undefined;
            if (res?.lyrics.originalLanguage === 'zh')
              converted = await window.api.lyrics.convertLyricsToPinyin();
            else if (res?.lyrics.originalLanguage === 'ja')
              converted = await window.api.lyrics.romanizeLyrics();
            else if (res?.lyrics.originalLanguage === 'ko')
              converted = await window.api.lyrics.convertLyricsToRomaja();

            if (isCurrent && converted) setLyrics(converted);
          }

          return undefined;
        })
        .catch((err) => console.error(err));
    }
    return () => {
      isCurrent = false;
    };
  }, [
    currentSongData.album?.name,
    currentSongData.artists,
    currentSongData.duration,
    currentSongData.path,
    currentSongData.songId,
    currentSongData.title,
    isLyricsVisible,
    preferences.autoTranslateLyrics,
    preferences.autoConvertLyrics,
    preferences.lyricsAutomaticallySaveState,
    setIsLyricsAvailable
  ]);

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
