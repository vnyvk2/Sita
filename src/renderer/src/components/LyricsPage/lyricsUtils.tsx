import type { ReactNode } from 'react';

import LyricLine from './LyricLine';

export function renderLyricsLines(
  lyrics: SongLyrics | null | undefined,
  songDuration: number,
  isAutoScrolling = true,
  playerType: 'normal' | 'full' | 'mini' = 'normal'
): ReactNode[] {
  if (!lyrics?.lyrics) return [];
  const { isSynced, parsedLyrics, offset = 0 } = lyrics.lyrics;

  if (isSynced && parsedLyrics) {
    const syncedLyricsLines = parsedLyrics.map((lyric, index) => {
      const { originalText } = lyric;
      const start = (lyric?.start || 0) + offset;
      const end =
        (lyric.end === Number.POSITIVE_INFINITY ? songDuration : lyric.end || 0) + offset;

      return (
        <LyricLine
          playerType={playerType}
          key={index}
          index={index}
          lyric={originalText}
          translatedLyricLines={lyric.translatedTexts}
          syncedLyrics={{ start, end }}
          isAutoScrolling={isAutoScrolling}
          convertedLyric={lyric.romanizedText}
        />
      );
    });

    const firstLine = (
      <LyricLine
        playerType={playerType}
        key="..."
        index={0}
        lyric="•••"
        syncedLyrics={{
          start: 0,
          end: (parsedLyrics[0]?.start || 0) + offset
        }}
        isAutoScrolling={isAutoScrolling}
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
          lyric={line.originalText}
          isAutoScrolling={isAutoScrolling}
          convertedLyric={line.romanizedText}
        />
      );
    });
  }

  return [];
}
