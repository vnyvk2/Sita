import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import i18n from '../../../i18n';
import { renderLyricsLines } from '../../LyricsPage/lyricsUtils';
import { useActiveLyricIndex } from '../../LyricsPage/useActiveLyricIndex';
import LyricsMetadata from '../../LyricsPage/LyricsMetadata';

type Props = { isLyricsVisible: boolean };

const LyricsContainer = (props: Props) => {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { t } = useTranslation();

  const { isLyricsVisible } = props;

  const [lyrics, setLyrics] = useState<SongLyrics | null | undefined>(null);
  const requestIdRef = useRef(0);
  useSkipLyricsLines(lyrics);

  const activeLineIndex = useActiveLyricIndex(isLyricsVisible ? lyrics : null);

  useEffect(() => {
    if (isLyricsVisible) {
      const currentRequestId = ++requestIdRef.current;

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
          if (currentRequestId !== requestIdRef.current) return;
          if (res) setLyrics(res);

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

            if (currentRequestId !== requestIdRef.current) return;
            if (translated) setLyrics(translated);
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

            if (currentRequestId !== requestIdRef.current) return;
            if (converted) setLyrics(converted);
          }
        })
        .catch((err) => {
          if (currentRequestId === requestIdRef.current) {
            console.error(err);
          }
        });
    }
  }, [
    currentSongData.album?.name,
    currentSongData.artists,
    currentSongData.duration,
    currentSongData.path,
    currentSongData.songId,
    currentSongData.title,
    preferences.autoTranslateLyrics,
    preferences.autoConvertLyrics,
    preferences.lyricsAutomaticallySaveState,
    isLyricsVisible
  ]);

  const lyricsComponents = useMemo(() => {
    return renderLyricsLines(lyrics, currentSongData.duration, true, 'mini', activeLineIndex);
  }, [lyrics, currentSongData.duration, activeLineIndex]);

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
    </div>
  );
};

export default LyricsContainer;
