import { describe, expect, it } from 'vitest';
import { albumFilterTypes, albumSortTypes } from '@renderer/utils/albumFilters';

describe('albumFilters', () => {
  it('should export expected albumFilterTypes', () => {
    expect(albumFilterTypes).toEqual(['notSelected', 'favorites']);
  });

  it('should export expected albumSortTypes', () => {
    expect(albumSortTypes).toEqual([
      'aToZ',
      'zToA',
      'noOfSongsAscending',
      'noOfSongsDescending'
    ]);
  });
});
