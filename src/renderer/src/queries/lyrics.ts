import { createQueryKeys } from '@lukemorales/query-key-factory';

export const lyricsQuery = createQueryKeys('lyrics', {
  single: (data: {
    title: string;
    artists: string[];
    album?: string;
    path: string;
    duration: number;
    lyricsType?: LyricsTypes;
    lyricsRequestType?: LyricsRequestTypes;
    saveLyricsAutomatically?: AutomaticallySaveLyricsTypes;
  }) => {
    const {
      title,
      artists,
      album,
      path,
      duration,
      lyricsType,
      lyricsRequestType,
      saveLyricsAutomatically
    } = data;

    return {
      queryKey: [
        `title=${title}`,
        `artists=${artists.join(',')}`,
        `album=${album}`,
        `path=${path}`,
        `duration=${duration}`,
        `lyricsType=${lyricsType}`,
        `lyricsRequestType=${lyricsRequestType}`,
        `saveLyricsAutomatically=${saveLyricsAutomatically}`
      ],
      queryFn: async () => {
        const res = await window.api.lyrics.getSongLyrics(
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
        return res ?? null;
      }
    };
  }
});
