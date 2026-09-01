/**
 * Song sort type constants shared between main and renderer. Extracted from
 * renderer/SongOptions.tsx to avoid cross-project boundary issues.
 */
export const songSortTypes = [
  'addedOrder',
  'customOrder',
  'originalOrder',
  'aToZ',
  'zToA',
  'dateAddedAscending',
  'dateAddedDescending',
  'dateModifiedAscending',
  'dateModifiedDescending',
  'releasedYearAscending',
  'releasedYearDescending',
  'trackNoAscending',
  'trackNoDescending',
  'artistNameAscending',
  'artistNameDescending',
  'allTimeMostListened',
  'allTimeLeastListened',
  'monthlyMostListened',
  'monthlyLeastListened',
  'albumNameAscending',
  'albumNameDescending',
  'mostSkipped',
  'leastSkipped',
  'blacklistedSongs',
  'whitelistedSongs'
] as const;

export type SongSortTypes = (typeof songSortTypes)[number];
