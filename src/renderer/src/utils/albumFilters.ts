export const albumSortTypes = [
  'aToZ',
  'zToA',
  'noOfSongsAscending',
  'noOfSongsDescending'
] as const;

export type AlbumSortTypes = (typeof albumSortTypes)[number];

export const albumFilterTypes = ['notSelected', 'favorites'] as const;

export type AlbumFilterTypes = (typeof albumFilterTypes)[number];
