import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import useSkipLyricsLines from '../../../hooks/useSkipLyricsLines';
import i18n from '../../../i18n';
import LyricLine from '../../LyricsPage/LyricLine';
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

  useEffect(() => {
    if (isLyricsVisible) {
      const currentRequestId = ++requestIdRef.current;
      setLyrics(null);
      window.api.lyrics
        .getSongLyrics({
          songTitle: currentSongData.title,
          songArtists: Array.isArray(currentSongData.artists)
            ? currentSongData.artists.map((artist) => artist.name)
            : [],
          album: currentSongData.album?.name,
          songPath: currentSongData.path,
          duration: currentSongData.duration
        })
        .then(async (res) => {
          if (currentRequestId !== requestIdRef.current) return;
          setLyrics(res);

          if (
            preferences.autoTranslateLyrics &&
            !res?.lyrics.isReset &&
            !res?.lyrics.isTranslated
          ) {
            const translated = await window.api.lyrics.getTranslatedLyrics(i18n.language as LanguageCodes);
            if (currentRequestId !== requestIdRef.current) return;
            setLyrics(translated);
          }
          if (preferences.autoConvertLyrics && !res?.lyrics.isReset && !res?.lyrics.isRomanized) {
            let converted: SongLyrics | null | undefined;
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
    isLyricsVisible
  ]);
  const lyricsComponents = useMemo(() => {
    if (lyrics && lyrics?.lyrics) {
      const { isSynced, parsedLyrics, offset = 0 } = lyrics.lyrics;

      if (isSynced) {
        const syncedLyricsLines = parsedLyrics.map((lyric, index) => {
          const { originalText: text, end = 0, start = 0 } = lyric;
          return (
            <LyricLine
              playerType="mini"
              key={index}
              index={index}
              lyric={text}
              syncedLyrics={{ start, end }}
              translatedLyricLines={lyric.translatedTexts}
              convertedLyric={lyric.romanizedText}
            />
          );
        });

        const firstLine = (
          <LyricLine
            playerType="mini"
            key="..."
            index={0}
            lyric="•••"
            syncedLyrics={{
              start: 0,
              end: (parsedLyrics[0]?.start || 0) + offset
            }}
          />
        );

        if ((parsedLyrics[0]?.start || 0) !== 0) syncedLyricsLines.unshift(firstLine);

        return syncedLyricsLines;
      }
      if (!isSynced) {
        return parsedLyrics.map((line, index) => {
          return (
            <LyricLine
              playerType="mini"
              key={index}
              index={index}
              lyric={line.originalText}
              translatedLyricLines={line.translatedTexts}
              convertedLyric={line.romanizedText}
            />
          );
        });
      }
    }
    return [];
  }, [lyrics]);

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
