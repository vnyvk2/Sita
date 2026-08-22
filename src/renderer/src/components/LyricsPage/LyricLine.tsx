/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { SYNCED_LYRICS_REGEX } from '@common/isLyricsSynced';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import roundTo from '../../../../common/roundTo';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import EnhancedSyncedLyricWord from '../LyricsEditingPage/EnhancedSyncedLyricWord';
import LyricsProgressBar from './LyricsProgressBar';

interface LyricProp {
  lyric: string | SyncedLyricsLineWord[];
  translatedLyricLines?: TranslatedLyricLine[];
  convertedLyric?: string | SyncedLyricsLineWord[];
  index: number;
  isActive?: boolean;
  syncedLyrics?: { start: number; end: number };
  isAutoScrolling?: boolean;
  playerType?: PlayerTypes | 'drawer';
}

const lyricsScrollIntoViewEvent = new CustomEvent('lyrics/scrollIntoView', {
  detail: 'scrollingUsingScrollIntoView'
});

const getLyricText = (lyrics: string) => {
  const match = SYNCED_LYRICS_REGEX.exec(lyrics);
  SYNCED_LYRICS_REGEX.lastIndex = 0;

  if (match && match.groups && match.groups.lyric) return match.groups.lyric.trim();
  return lyrics;
};

const LyricLine = (props: LyricProp) => {
  const { updateSongPosition, updateContextMenuData } = useContext(AppUpdateContext);
  const { t } = useTranslation();

  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const prevIsActiveRef = useRef(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);

  const {
    index,
    lyric,
    translatedLyricLines = [],
    convertedLyric,
    syncedLyrics,
    isActive = false,
    isAutoScrolling = true,
    playerType = 'normal'
  } = props;

  // Auto-scroll only when this line becomes active
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current) {
      if (isAutoScrolling && lyricsRef.current) {
        lyricsRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });
      }
      document.dispatchEvent(lyricsScrollIntoViewEvent);
    }
    prevIsActiveRef.current = isActive;
  }, [isActive, isAutoScrolling]);

  // Word-level active tracking: ONLY when this line is active AND has word-level timestamps
  useEffect(() => {
    if (!isActive) {
      setActiveWordIndex(null);
      return undefined;
    }

    const wordArrays = [lyric, translatedLyricLines[0]?.text, convertedLyric].filter(
      (l): l is SyncedLyricsLineWord[] => Array.isArray(l)
    );

    if (wordArrays.length === 0) {
      return undefined;
    }

    const handlePosition = (e: Event) => {
      if ('detail' in e && typeof e.detail === 'number') {
        const pos = e.detail;
        const primaryWords = wordArrays[0];
        let foundIdx: number | null = null;
        for (let i = 0; i < primaryWords.length; i += 1) {
          if (pos >= primaryWords[i].start && pos < primaryWords[i].end) {
            foundIdx = i;
            break;
          }
        }
        setActiveWordIndex((prev) => (prev !== foundIdx ? foundIdx : prev));
      }
    };

    document.addEventListener('player/positionChange', handlePosition);
    return () => document.removeEventListener('player/positionChange', handlePosition);
  }, [isActive, lyric, translatedLyricLines, convertedLyric]);

  const lyricString = useMemo(() => {
    if (typeof lyric === 'string') return getLyricText(lyric);

    return lyric.map((extendedText, i) => (
      <EnhancedSyncedLyricWord
        key={i}
        isActive={isActive}
        isHighlighted={activeWordIndex === i}
        start={extendedText.start}
        end={extendedText.end}
        text={extendedText.text}
        delay={0}
      />
    ));
  }, [isActive, activeWordIndex, lyric]);

  const translatedLyricString = useMemo(() => {
    if (translatedLyricLines.length === 0) return undefined;

    const translatedLyric = translatedLyricLines[0].text;
    if (typeof translatedLyric === 'string') return getLyricText(translatedLyric);

    return translatedLyric.map((extendedText, i) => (
      <EnhancedSyncedLyricWord
        key={i}
        isActive={isActive}
        isHighlighted={activeWordIndex === i}
        start={extendedText.start}
        end={extendedText.end}
        text={extendedText.text}
        delay={0}
      />
    ));
  }, [isActive, activeWordIndex, translatedLyricLines]);

  const convertedLyricString = useMemo(() => {
    if (!convertedLyric || convertedLyric.length === 0) return undefined;
    if (typeof convertedLyric === 'string') return getLyricText(convertedLyric);

    return convertedLyric.map((extendedText, i) => (
      <EnhancedSyncedLyricWord
        key={i}
        isActive={isActive}
        isHighlighted={activeWordIndex === i}
        start={extendedText.start}
        end={extendedText.end}
        text={extendedText.text}
        delay={0}
      />
    ));
  }, [isActive, activeWordIndex, convertedLyric]);

  const lyricStringLinePrimary = translatedLyricString ?? convertedLyricString ?? lyricString;
  let lyricStringLineSecondaryUpper;
  if (translatedLyricString) lyricStringLineSecondaryUpper = convertedLyricString ?? lyricString;

  return (
    <div
      style={{
        animationDelay: `${100 + 20 * (index + 1)}ms`
      }}
      title={
        syncedLyrics
          ? t(`lyricsEditingPage.fromTo`, {
              start: roundTo(syncedLyrics.start, 2),
              end: roundTo(syncedLyrics.end, 2)
            })
          : undefined
      }
      className={`highlight text-font-color-black/20 dark:text-font-color-white/20 z-0 mb-5 flex w-fit flex-col items-center justify-center text-center text-5xl font-medium text-balance transition-[transform,translate,scale,color,filter] duration-250 select-none first:mt-8 last:mb-4 empty:mb-16 ${
        syncedLyrics
          ? `cursor-pointer blur-[1px] ${
              isActive
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight! scale-100! font-semibold blur-none! [&>div>span]:mr-3!'
                : 'scale-75!'
            }`
          : 'text-font-color-black! dark:text-font-color-white! scale-100! text-4xl! font-medium blur-none! [&>div>span]:mr-3'
      } ${playerType === 'mini' && 'text-font-color-white/20! mb-2! text-2xl!'} ${
        playerType === 'drawer' &&
        'mb-4! text-2xl! leading-snug items-center! justify-center! text-center! w-full!'
      } ${
        playerType === 'full' &&
        'text-font-color-white/20! mb-6! origin-left items-start! justify-start! text-left! text-7xl!'
      }`}
      ref={lyricsRef}
      onClick={() =>
        syncedLyrics &&
        (typeof lyric === 'string' || translatedLyricString) &&
        updateSongPosition(syncedLyrics.start)
      }
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        updateContextMenuData(
          true,
          [
            {
              label: t('common.copy'),
              class: 'sync',
              iconName: 'content_copy',
              iconClassName: 'material-icons-round-outlined',
              handlerFunction: () =>
                window.navigator.clipboard.writeText(
                  typeof lyric === 'string'
                    ? getLyricText(lyric)
                    : lyric.map((x) => x.text).join(' ')
                )
            }
          ],
          e.pageX,
          e.pageY
        );
      }}
    >
      {lyricStringLineSecondaryUpper && (
        <div
          className={`flex flex-row flex-wrap ${
            playerType !== 'full' && 'items-center justify-center text-center'
          } ${
            playerType === 'drawer'
              ? 'text-xs!'
              : syncedLyrics && isActive
                ? 'text-font-color-black/50! dark:text-font-color-white/50! text-xl!'
                : 'text-xl!'
          }`}
        >
          {lyricStringLineSecondaryUpper}
        </div>
      )}
      <div
        className={`flex flex-row flex-wrap ${
          playerType !== 'full' && 'items-center justify-center text-center'
        }`}
      >
        {lyricStringLinePrimary}
      </div>
      {syncedLyrics && isActive && <LyricsProgressBar delay={0} syncedLyrics={syncedLyrics} />}
    </div>
  );
};

LyricLine.displayName = 'LyricLine';

export default memo(LyricLine);
