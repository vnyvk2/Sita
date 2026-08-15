import { SYNCED_LYRICS_REGEX } from '@common/isLyricsSynced';
import { store } from '@renderer/store/store';
import { useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import i18n from '../../i18n';
import { CloseIcon } from '../Icons/WindowIcons';

type Props = {
  isLyricsVisible: boolean;
  onClose: () => void;
};

const getLyricPlainText = (text?: string | SyncedLyricsLineWord[]): string => {
  if (!text) return '';
  if (typeof text === 'string') {
    const match = SYNCED_LYRICS_REGEX.exec(text);
    SYNCED_LYRICS_REGEX.lastIndex = 0;
    if (match?.groups?.lyric) return match.groups.lyric.trim();
    return text;
  }
  return text.map((word) => word.text).join(' ').trim();
};

const CompactLyricsPanel = (props: Props) => {
  const { isLyricsVisible, onClose } = props;

  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const { t } = useTranslation();

  const [lyrics, setLyrics] = useState<SongLyrics | null | undefined>(null);
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(-1);
  const requestIdRef = useRef(0);

  // Fetch lyrics on song or visibility change
  useEffect(() => {
    if (!isLyricsVisible) return;

    const currentRequestId = ++requestIdRef.current;
    setLyrics(null);
    setCurrentLineIndex(-1);

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
          const translated = await window.api.lyrics.getTranslatedLyrics(
            i18n.language as LanguageCodes
          );
          if (currentRequestId !== requestIdRef.current) return;
          setLyrics(translated);
        }
        if (
          preferences.autoConvertLyrics &&
          !res?.lyrics.isReset &&
          !res?.lyrics.isRomanized
        ) {
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
          console.error('Failed to fetch lyrics for compact lyrics panel', err);
        }
      });
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

  // Track playback position to highlight active synced line
  const handlePositionChange = useCallback(
    (e: Event) => {
      if (!('detail' in e) || typeof e.detail !== 'number') return;
      const position = e.detail;

      if (lyrics?.lyrics?.isSynced && lyrics.lyrics.parsedLyrics) {
        const parsed = lyrics.lyrics.parsedLyrics;
        const index = parsed.findIndex((line) => {
          const start = line.start ?? 0;
          const end = line.end ?? Number.POSITIVE_INFINITY;
          return position >= start && position < end;
        });

        if (index !== -1) {
          setCurrentLineIndex(index);
        } else if (parsed.length > 0 && position < (parsed[0].start ?? 0)) {
          setCurrentLineIndex(-1);
        }
      }
    },
    [lyrics]
  );

  useEffect(() => {
    document.addEventListener('player/positionChange', handlePositionChange);
    return () => document.removeEventListener('player/positionChange', handlePositionChange);
  }, [handlePositionChange]);

  const parsedLyrics = useMemo(
    () => lyrics?.lyrics?.parsedLyrics ?? [],
    [lyrics?.lyrics?.parsedLyrics]
  );
  const isSynced = lyrics?.lyrics?.isSynced ?? false;

  const previousLineText = useMemo(() => {
    if (!isSynced || currentLineIndex <= 0) return '';
    return getLyricPlainText(parsedLyrics[currentLineIndex - 1]?.originalText);
  }, [isSynced, currentLineIndex, parsedLyrics]);

  const currentLineText = useMemo(() => {
    if (!isSynced) return '';
    if (currentLineIndex === -1) {
      return getLyricPlainText(parsedLyrics[0]?.originalText) || '•••';
    }
    return getLyricPlainText(parsedLyrics[currentLineIndex]?.originalText);
  }, [isSynced, currentLineIndex, parsedLyrics]);

  const nextLineText = useMemo(() => {
    if (!isSynced) return '';
    const nextIdx = currentLineIndex === -1 ? 1 : currentLineIndex + 1;
    if (nextIdx >= parsedLyrics.length) return '';
    return getLyricPlainText(parsedLyrics[nextIdx]?.originalText);
  }, [isSynced, currentLineIndex, parsedLyrics]);

  return (
    <div
      data-testid="compact-lyrics-panel"
      className="compact-lyrics-panel relative flex h-[160px] min-h-[160px] w-full flex-col justify-between overflow-hidden bg-[rgba(18,18,22,0.96)] px-4 py-3 select-none backdrop-blur-xl border-t border-white/10 [-webkit-app-region:no-drag]"
    >
      {/* ── Floating Close Button ── */}
      <button
        type="button"
        className="absolute top-2 right-2 z-30 flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm bg-black/40 text-font-color-white/70 transition-colors hover:bg-[#e81123] hover:text-white"
        onClick={onClose}
        title={t('common.close', 'Close')}
      >
        <CloseIcon className="h-2 w-2" />
      </button>

      {/* ── Synced 3-Line Presentation ── */}
      {lyrics && isSynced && parsedLyrics.length > 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5 overflow-hidden text-center">
          <div className="h-4 max-w-full truncate text-[11px] font-normal text-font-color-white/40 transition-opacity duration-200">
            {previousLineText}
          </div>

          <div className="max-w-full px-2 text-sm font-semibold text-font-color-highlight transition-all duration-200 drop-shadow-sm leading-snug">
            {currentLineText}
          </div>

          <div className="h-4 max-w-full truncate text-[11px] font-normal text-font-color-white/50 transition-opacity duration-200">
            {nextLineText}
          </div>
        </div>
      )}

      {/* ── Unsynced Plain-Text Scrollable Presentation ── */}
      {lyrics && !isSynced && parsedLyrics.length > 0 && (
        <div className="flex flex-1 flex-col items-center overflow-y-auto px-2 py-1 text-center scrollbar-thin">
          {parsedLyrics.map((line, idx) => (
            <div
              key={idx}
              className="py-0.5 text-xs text-font-color-white/80 leading-relaxed"
            >
              {getLyricPlainText(line.originalText)}
            </div>
          ))}
        </div>
      )}

      {/* ── Loading / Empty States ── */}
      {lyrics === null && (
        <div className="flex flex-1 items-center justify-center text-xs text-font-color-white/60">
          {t('lyricsPage.loadingLyrics', 'Loading lyrics...')}
        </div>
      )}

      {lyrics !== null && parsedLyrics.length === 0 && (
        <div className="flex flex-1 items-center justify-center text-xs text-font-color-white/60">
          {t('lyricsPage.noLyrics', 'No lyrics available')}
        </div>
      )}

      {/* ── Attribution Footer ── */}
      {lyrics?.source && (
        <div className="text-[9px] text-font-color-white/40 text-center select-none truncate">
          {lyrics.source}
        </div>
      )}
    </div>
  );
};

export default CompactLyricsPanel;
