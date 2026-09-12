/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import { SYNCED_LYRICS_REGEX } from '@common/isLyricsSynced';
import { memo, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import roundTo from '../../../../common/roundTo';
import { AppUpdateContext } from '../../contexts/AppUpdateContext';
import { useAudioPlayer } from '../../hooks/useAudioPlayer';
import { computeLyricLoopRange } from '../../utils/lyricLoopRange';
import EnhancedSyncedLyricWord from '../LyricsEditingPage/EnhancedSyncedLyricWord';
import LyricsProgressBar from './LyricsProgressBar';

interface LyricProp {
  lyric: string | SyncedLyricsLineWord[];
  translatedLyricLines?: TranslatedLyricLine[];
  convertedLyric?: string | SyncedLyricsLineWord[];
  index: number;
  isActive?: boolean;
  syncedStart?: number;
  syncedEnd?: number;
  prevLineEnd?: number;
  nextLineStart?: number;
  songDuration?: number;
  isInAbLoop?: boolean;
  isLoopStart?: boolean;
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
  const { updateSongPosition, updateContextMenuData, addNewNotifications } =
    useContext(AppUpdateContext);
  const { t } = useTranslation();
  const player = useAudioPlayer();

  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const prevIsActiveRef = useRef(false);
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);

  const {
    index,
    lyric,
    translatedLyricLines = [],
    convertedLyric,
    syncedStart,
    syncedEnd,
    prevLineEnd,
    nextLineStart,
    songDuration,
    isInAbLoop = false,
    isLoopStart = false,
    isActive = false,
    isAutoScrolling = true,
    playerType = 'normal'
  } = props;

  const isSynced = syncedStart !== undefined && syncedEnd !== undefined;

  // Auto-scroll only when this line becomes active
  useEffect(() => {
    if (isActive && !prevIsActiveRef.current) {
      if (isAutoScrolling && lyricsRef.current?.scrollIntoView) {
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
        isSynced
          ? t(`lyricsEditingPage.fromTo`, {
              start: roundTo(syncedStart, 2),
              end: roundTo(syncedEnd, 2)
            })
          : undefined
      }
      className={`highlight text-font-color-black/20 dark:text-font-color-white/20 z-0 mb-5 flex w-fit flex-col items-center justify-center text-center text-5xl font-medium text-balance transition-[transform,translate,scale,color,filter] duration-250 select-none first:mt-8 last:mb-4 empty:mb-16 ${
        isSynced
          ? `cursor-pointer blur-[1px] ${
              isActive
                ? 'text-font-color-highlight! dark:text-dark-font-color-highlight! scale-100! font-semibold blur-none! [&>div>span]:mr-3!'
                : isInAbLoop
                  ? 'text-font-color-black/75! dark:text-font-color-white/75! scale-90! blur-none! [&>div>span]:mr-3!'
                  : 'scale-75!'
            }`
          : 'text-font-color-black! dark:text-font-color-white! scale-100! text-4xl! font-medium blur-none! [&>div>span]:mr-3'
      } ${
        isInAbLoop &&
        'ring-font-color-highlight/25 dark:ring-dark-font-color-highlight/25 rounded-2xl px-4 py-1.5 ring-1'
      } ${playerType === 'mini' && 'text-font-color-white/20! mb-2! text-2xl!'} ${
        playerType === 'drawer' &&
        'mb-4! w-full! items-center! justify-center! text-center! text-2xl! leading-snug'
      } ${
        playerType === 'full' &&
        'text-font-color-white/20! mb-6! origin-left items-start! justify-start! text-left! text-7xl!'
      }`}
      ref={lyricsRef}
      onClick={(e) => {
        if (!isSynced || (typeof lyric !== 'string' && !translatedLyricString)) return;

        if (e.altKey) {
          e.preventDefault();
          e.stopPropagation();

          const range = computeLyricLoopRange({
            syncedStart,
            syncedEnd,
            prevEnd: prevLineEnd,
            nextStart: nextLineStart,
            songDuration
          });

          if (range.success) {
            player.setAbLoopRange(range.start, range.end);
            player.seek(range.start);

            if (addNewNotifications) {
              const snippet =
                typeof lyric === 'string'
                  ? getLyricText(lyric)
                  : lyric.map((x) => x.text).join(' ');
              const shortSnippet = snippet.length > 30 ? `${snippet.slice(0, 30)}…` : snippet;
              addNewNotifications([
                {
                  id: 'abLoop',
                  iconName: 'repeat',
                  content: t('lyricsPage.loopingSnippet', {
                    snippet: shortSnippet,
                    defaultValue: `Looping: "${shortSnippet}"`
                  })
                }
              ]);
            }
          }
          return;
        }

        updateSongPosition(syncedStart);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();

        const menuItems: ContextMenuItem[] = [];

        if (isSynced && index >= 0) {
          const range = computeLyricLoopRange({
            syncedStart,
            syncedEnd,
            prevEnd: prevLineEnd,
            nextStart: nextLineStart,
            songDuration
          });

          menuItems.push(
            {
              label: t('lyricsPage.loopThisLine', 'Loop this line'),
              iconName: 'repeat_one',
              iconClassName: 'material-icons-round-outlined',
              handlerFunction: () => {
                if (range.success) {
                  player.setAbLoopRange(range.start, range.end);
                  player.seek(range.start);

                  if (addNewNotifications) {
                    const snippet =
                      typeof lyric === 'string'
                        ? getLyricText(lyric)
                        : lyric.map((x) => x.text).join(' ');
                    const shortSnippet = snippet.length > 30 ? `${snippet.slice(0, 30)}…` : snippet;
                    addNewNotifications([
                      {
                        id: 'abLoop',
                        iconName: 'repeat',
                        content: t('lyricsPage.loopingSnippet', {
                          snippet: shortSnippet,
                          defaultValue: `Looping: "${shortSnippet}"`
                        })
                      }
                    ]);
                  }
                }
              }
            },
            {
              label: t('lyricsPage.setLoopStart', 'Set as Loop Start (A)'),
              iconName: 'first_page',
              iconClassName: 'material-icons-round-outlined',
              handlerFunction: () => {
                player.setAbLoopPointA(range.start);
              }
            },
            {
              label: t('lyricsPage.setLoopEnd', 'Set as Loop End (B)'),
              iconName: 'last_page',
              iconClassName: 'material-icons-round-outlined',
              handlerFunction: () => {
                player.setAbLoopPointB(range.end);
              }
            }
          );

          const loopState = player.getAbLoopState();
          if (loopState.phase !== 'idle') {
            menuItems.push({
              label: t('lyricsPage.clearLoop', 'Clear A-B Loop'),
              iconName: 'close',
              iconClassName: 'material-icons-round-outlined',
              handlerFunction: () => {
                player.clearAbLoop('USER_MANUAL');
              }
            });
          }

          menuItems.push({
            label: '',
            isContextMenuItemSeperator: true,
            handlerFunction: null
          });
        }

        menuItems.push({
          label: t('common.copy'),
          class: 'sync',
          iconName: 'content_copy',
          iconClassName: 'material-icons-round-outlined',
          handlerFunction: () =>
            window.navigator.clipboard.writeText(
              typeof lyric === 'string' ? getLyricText(lyric) : lyric.map((x) => x.text).join(' ')
            )
        });

        updateContextMenuData(true, menuItems, e.pageX, e.pageY);
      }}
    >
      {isLoopStart && (
        <span className="ab-loop-badge bg-font-color-highlight/15 dark:bg-dark-font-color-highlight/20 text-font-color-highlight dark:text-dark-font-color-highlight mb-1.5 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase">
          <span className="material-icons-round text-xs">repeat</span>
          A-B Loop
        </span>
      )}
      {lyricStringLineSecondaryUpper && (
        <div
          className={`flex flex-row flex-wrap ${
            playerType !== 'full' && 'items-center justify-center text-center'
          } ${
            playerType === 'drawer'
              ? 'text-xs!'
              : isSynced && isActive
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
      {isSynced && isActive && (
        <LyricsProgressBar delay={0} syncedStart={syncedStart} syncedEnd={syncedEnd} />
      )}
    </div>
  );
};

LyricLine.displayName = 'LyricLine';

export default memo(LyricLine);
