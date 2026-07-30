export const PLAYLIST_FORMATS = {
  M3U: '.m3u',
  M3U8: '.m3u8',
  XSPF: '.xspf',
  PLS: '.pls',
  WPL: '.wpl'
} as const;

export type PlaylistFormat = 'm3u' | 'm3u8' | 'xspf' | 'pls' | 'wpl';

export const SUPPORTED_PLAYLIST_EXTENSIONS: readonly string[] = [
  PLAYLIST_FORMATS.M3U,
  PLAYLIST_FORMATS.M3U8,
  PLAYLIST_FORMATS.XSPF,
  PLAYLIST_FORMATS.PLS,
  PLAYLIST_FORMATS.WPL
];
