import i18n from '@renderer/i18n';
import {
  albumFilterTypes,
  type AlbumFilterTypes,
  albumSortTypes,
  type AlbumSortTypes
} from '@renderer/utils/albumFilters';

import type { DropdownOption } from '../Dropdown';

export { albumFilterTypes, type AlbumFilterTypes, albumSortTypes, type AlbumSortTypes };

export const albumSortOptions: DropdownOption<AlbumSortTypes>[] = [
  { label: i18n.t('sortTypes.aToZ'), value: 'aToZ' },
  { label: i18n.t('sortTypes.zToA'), value: 'zToA' },
  {
    label: i18n.t('sortTypes.noOfSongsDescending'),
    value: 'noOfSongsDescending'
  },
  {
    label: i18n.t('sortTypes.noOfSongsAscending'),
    value: 'noOfSongsAscending'
  }
];

export const albumFilterOptions: DropdownOption<AlbumFilterTypes>[] = [
  { label: i18n.t('filterTypes.notSelected'), value: 'notSelected' },
  { label: i18n.t('filterTypes.favorites'), value: 'favorites' }
];
