import i18n from '../../i18n';
import { type DropdownOption } from '../Dropdown';

export { songSortTypes, type SongSortTypes } from '../../../../common/songSortTypes';
import type { SongSortTypes } from '../../../../common/songSortTypes';
export type PlaylistViewMode = SongSortTypes;


export function canReorder(viewMode?: PlaylistViewMode | string): boolean {
  return viewMode === 'customOrder';
}

export function isPersistentPlaylistOrder(viewMode?: PlaylistViewMode | string): boolean {
  return viewMode === 'customOrder' || viewMode === 'originalOrder';
}

export const playlistSortOptions: DropdownOption<SongSortTypes>[] = [
  { label: i18n.t('sortTypes.customOrder', 'Custom Order'), value: 'customOrder' },
  { label: i18n.t('sortTypes.originalOrder', 'Original Order'), value: 'originalOrder' },
  { label: '', value: 'customOrder', isDivider: true },
  { label: i18n.t('sortTypes.aToZ'), value: 'aToZ' },
  { label: i18n.t('sortTypes.zToA'), value: 'zToA' },
  {
    label: i18n.t('sortTypes.dateAddedAscending'),
    value: 'dateAddedAscending'
  },
  {
    label: i18n.t('sortTypes.dateAddedDescending'),
    value: 'dateAddedDescending'
  },
  {
    label: i18n.t('sortTypes.releasedYearAscending'),
    value: 'releasedYearAscending'
  },
  {
    label: i18n.t('sortTypes.releasedYearDescending'),
    value: 'releasedYearDescending'
  },
  {
    label: i18n.t('sortTypes.allTimeMostListened'),
    value: 'allTimeMostListened'
  },
  {
    label: i18n.t('sortTypes.artistNameAscending'),
    value: 'artistNameAscending'
  },
  {
    label: i18n.t('sortTypes.albumNameAscending'),
    value: 'albumNameAscending'
  }
];

export const songFilterTypes = [
  'notSelected',
  'blacklistedSongs',
  'whitelistedSongs',
  'favorites',
  'nonFavorites'
] as const;

export const songSortOptions: DropdownOption<SongSortTypes>[] = [
  { label: i18n.t('sortTypes.addedOrder'), value: 'addedOrder' },
  { label: i18n.t('sortTypes.aToZ'), value: 'aToZ' },
  { label: i18n.t('sortTypes.zToA'), value: 'zToA' },
  {
    label: i18n.t('sortTypes.dateAddedAscending'),
    value: 'dateAddedAscending'
  },
  {
    label: i18n.t('sortTypes.dateAddedDescending'),
    value: 'dateAddedDescending'
  },
  {
    label: i18n.t('sortTypes.dateModifiedAscending'),
    value: 'dateModifiedAscending'
  },
  {
    label: i18n.t('sortTypes.dateModifiedDescending'),
    value: 'dateModifiedDescending'
  },
  {
    label: i18n.t('sortTypes.releasedYearAscending'),
    value: 'releasedYearAscending'
  },
  {
    label: i18n.t('sortTypes.releasedYearDescending'),
    value: 'releasedYearDescending'
  },
  {
    label: i18n.t('sortTypes.allTimeMostListened'),
    value: 'allTimeMostListened'
  },
  {
    label: i18n.t('sortTypes.allTimeLeastListened'),
    value: 'allTimeLeastListened'
  },
  {
    label: i18n.t('sortTypes.monthlyMostListened'),
    value: 'monthlyMostListened'
  },
  {
    label: i18n.t('sortTypes.monthlyLeastListened'),
    value: 'monthlyLeastListened'
  },
  {
    label: i18n.t('sortTypes.artistNameAscending'),
    value: 'artistNameAscending'
  },
  {
    label: i18n.t('sortTypes.artistNameDescending'),
    value: 'artistNameDescending'
  },
  {
    label: i18n.t('sortTypes.albumNameAscending'),
    value: 'albumNameAscending'
  },
  {
    label: i18n.t('sortTypes.albumNameDescending'),
    value: 'albumNameDescending'
  },
  {
    label: i18n.t('sortTypes.mostSkipped'),
    value: 'mostSkipped'
  },
  {
    label: i18n.t('sortTypes.leastSkipped'),
    value: 'leastSkipped'
  }
];

export const songFilterOptions: DropdownOption<SongFilterTypes>[] = [
  { label: i18n.t('filterTypes.notSelected'), value: 'notSelected' },
  { label: i18n.t('filterTypes.blacklistedSongs'), value: 'blacklistedSongs' },
  {
    label: i18n.t('filterTypes.whitelistedSongs'),
    value: 'whitelistedSongs'
  },
  {
    label: i18n.t('filterTypes.favorites'),
    value: 'favorites'
  },
  {
    label: i18n.t('filterTypes.nonFavorites'),
    value: 'nonFavorites'
  }
];
