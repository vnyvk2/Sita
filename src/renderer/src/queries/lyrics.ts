import { createQueryKeys } from '@lukemorales/query-key-factory';
import { useQuery } from '@tanstack/react-query';
import { useStore } from '@tanstack/react-store';
import { useMemo } from 'react';

import i18n from '../i18n';
import { store } from '../store/store';

export interface LyricsQueryParams {
  title: string;
  artists: string[];
  album?: string;
  path: string;
  duration: number;
  lyricsType?: LyricsTypes;
  lyricsRequestType?: LyricsRequestTypes;
  saveLyricsAutomatically?: AutomaticallySaveLyricsTypes;
  autoTranslateLyrics?: boolean;
  autoConvertLyrics?: boolean;
  targetLanguage?: string;
}

export const lyricsQuery = createQueryKeys('lyrics', {
  single: (data: LyricsQueryParams) => {
    const {
      title,
      artists,
      album,
      path,
      duration,
      lyricsType = 'ANY',
      lyricsRequestType = 'ANY',
      saveLyricsAutomatically = 'NONE',
      autoTranslateLyrics = false,
      autoConvertLyrics = false,
      targetLanguage = i18n.language
    } = data;

    return {
      queryKey: [
        `title=${title}`,
        `artists=${artists.join(',')}`,
        `album=${album ?? ''}`,
        `path=${path}`,
        `duration=${duration}`,
        `lyricsType=${lyricsType}`,
        `lyricsRequestType=${lyricsRequestType}`,
        `saveLyricsAutomatically=${saveLyricsAutomatically}`,
        `autoTranslate=${autoTranslateLyrics}:${targetLanguage}`,
        `autoConvert=${autoConvertLyrics}`
      ],
      queryFn: async () => {
        if (!title || !path) return null;

        let res = await window.api.lyrics.getSongLyrics(
          {
            songTitle: title,
            songArtists: artists,
            album: album,
            songPath: path,
            duration: duration
          },
          lyricsType,
          lyricsRequestType,
          saveLyricsAutomatically
        );

        if (!res) return null;

        // Auto-translation step if configured and not already translated
        if (
          autoTranslateLyrics &&
          !res.lyrics.isReset &&
          !res.lyrics.isTranslated &&
          res.lyrics.originalLanguage !== targetLanguage
        ) {
          try {
            const translated = await window.api.lyrics.getTranslatedLyrics(
              targetLanguage as LanguageCodes
            );
            if (translated) res = translated;
          } catch (err) {
            console.warn('Auto-translate lyrics failed:', err);
          }
        }

        // Auto-conversion step (pinyin / romanization / romaja) if configured
        if (autoConvertLyrics && !res.lyrics.isReset && !res.lyrics.isRomanized) {
          try {
            let converted: SongLyrics | null | undefined;
            if (res.lyrics.originalLanguage === 'zh') {
              converted = await window.api.lyrics.convertLyricsToPinyin();
            } else if (res.lyrics.originalLanguage === 'ja') {
              converted = await window.api.lyrics.romanizeLyrics();
            } else if (res.lyrics.originalLanguage === 'ko') {
              converted = await window.api.lyrics.convertLyricsToRomaja();
            }
            if (converted) res = converted;
          } catch (err) {
            console.warn('Auto-convert lyrics failed:', err);
          }
        }

        return res ?? null;
      }
    };
  }
});

export interface UseLyricsQueryOptions {
  enabled?: boolean;
  lyricsType?: LyricsTypes;
  lyricsRequestType?: LyricsRequestTypes;
}

/**
 * Central hook for querying synced/unsynced song lyrics with automatic translation, romanization,
 * and shared TanStack Query caching across all views.
 */
export function useLyricsQuery(options?: UseLyricsQueryOptions) {
  const currentSongData = useStore(store, (state) => state.currentSongData);
  const preferences = useStore(store, (state) => state.localStorage.preferences);

  const isEnabled =
    (options?.enabled ?? true) && Boolean(currentSongData?.title && currentSongData?.path);

  const artists = useMemo(() => {
    return Array.isArray(currentSongData?.artists)
      ? currentSongData.artists.map((a) => a.name)
      : [];
  }, [currentSongData?.artists]);

  return useQuery({
    ...lyricsQuery.single({
      title: currentSongData?.title ?? '',
      artists,
      album: currentSongData?.album?.name,
      path: currentSongData?.path ?? '',
      duration: currentSongData?.duration ?? 0,
      lyricsType: options?.lyricsType ?? 'ANY',
      lyricsRequestType: options?.lyricsRequestType ?? 'ANY',
      saveLyricsAutomatically: preferences?.lyricsAutomaticallySaveState ?? 'NONE',
      autoTranslateLyrics: preferences?.autoTranslateLyrics ?? false,
      autoConvertLyrics: preferences?.autoConvertLyrics ?? false,
      targetLanguage: i18n.language
    }),
    enabled: isEnabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 3 * 60 * 1000 // 3 minutes (garbage collected when unreferenced)
  });
}
