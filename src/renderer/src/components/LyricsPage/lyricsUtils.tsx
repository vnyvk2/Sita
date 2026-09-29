import type { ReactNode } from 'react';

import LyricLine from './LyricLine';

/**
 * Scroll behavior honoring the OS reduced-motion setting. All programmatic
 * lyrics scrolling must go through this so motion-sensitive users get instant
 * jumps instead of smooth animations.
 */
export function getLyricScrollBehavior(): ScrollBehavior {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return 'auto';
    }
  } catch {
    // Ignore matchMedia failures and fall through to smooth scrolling.
  }
  return 'smooth';
}

export function renderLyricsLines(
  lyrics: SongLyrics | null | undefined,
  songDuration: number,
  isAutoScrolling = true,
  playerType: 'normal' | 'full' | 'mini' | 'drawer' = 'normal',
  activeLineIndex: number | null = null,
  abLoop?: AbLoopState | null,
  // When false, lines never scroll themselves (container-owned auto-follow
  // drives scrolling instead, keeping ancestor scrollers untouched).
  selfScroll = true
): ReactNode[] {
  if (!lyrics?.lyrics) return [];
  const { isSynced, parsedLyrics, offset = 0 } = lyrics.lyrics;

  if (isSynced && parsedLyrics) {
    const syncedLyricsLines = parsedLyrics.map((lyric, index) => {
      const { originalText } = lyric;
      const start = (lyric?.start || 0) + offset;
      const end = (lyric.end === Number.POSITIVE_INFINITY ? songDuration : lyric.end || 0) + offset;

      const prevLine = index > 0 ? parsedLyrics[index - 1] : undefined;
      const prevLineEnd = prevLine
        ? (prevLine.end === Number.POSITIVE_INFINITY ? songDuration : prevLine.end || 0) + offset
        : undefined;

      const nextLine = index < parsedLyrics.length - 1 ? parsedLyrics[index + 1] : undefined;
      const nextLineStart = nextLine ? (nextLine.start || 0) + offset : undefined;

      const lineMid = (start + end) / 2;
      const isInAbLoop = Boolean(
        abLoop &&
        abLoop.phase === 'active' &&
        abLoop.pointA !== null &&
        abLoop.pointB !== null &&
        lineMid >= abLoop.pointA &&
        lineMid <= abLoop.pointB
      );

      const isLoopStart = Boolean(
        isInAbLoop &&
        abLoop &&
        abLoop.pointA !== null &&
        start <= abLoop.pointA + 0.25 &&
        end > abLoop.pointA
      );

      return (
        <LyricLine
          playerType={playerType}
          key={index}
          index={index}
          isActive={activeLineIndex === index}
          lyric={originalText}
          translatedLyricLines={lyric.translatedTexts}
          syncedStart={start}
          syncedEnd={end}
          prevLineEnd={prevLineEnd}
          nextLineStart={nextLineStart}
          songDuration={songDuration}
          isInAbLoop={isInAbLoop}
          isLoopStart={isLoopStart}
          isAutoScrolling={isAutoScrolling}
          convertedLyric={lyric.romanizedText}
          selfScroll={selfScroll}
        />
      );
    });

    const firstLine = (
      <LyricLine
        playerType={playerType}
        key="..."
        index={-1}
        isActive={activeLineIndex === -1}
        lyric="•••"
        syncedStart={0}
        syncedEnd={(parsedLyrics[0]?.start || 0) + offset}
        isAutoScrolling={isAutoScrolling}
        selfScroll={selfScroll}
      />
    );

    if ((parsedLyrics[0]?.start || 0) !== 0) syncedLyricsLines.unshift(firstLine);
    return syncedLyricsLines;
  }

  if (!isSynced && parsedLyrics) {
    return parsedLyrics.map((line, index) => {
      return (
        <LyricLine
          playerType={playerType}
          key={index}
          index={index}
          isActive={false}
          lyric={line.originalText}
          translatedLyricLines={line.translatedTexts}
          isAutoScrolling={isAutoScrolling}
          convertedLyric={line.romanizedText}
          selfScroll={selfScroll}
        />
      );
    });
  }

  return [];
}
