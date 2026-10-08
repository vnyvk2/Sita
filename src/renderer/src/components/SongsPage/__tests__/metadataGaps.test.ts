import { describe, expect, it } from 'vitest';

import { getMetadataGaps } from '../metadataGaps';

describe('getMetadataGaps', () => {
  it('returns no gaps for a complete song', () => {
    expect(
      getMetadataGaps({
        genres: [{ name: 'Rock' }],
        year: 2021,
        artworkPaths: { artworkPath: 'nora://art/1' },
        artists: [{ name: 'Artist' }]
      })
    ).toEqual([]);
  });

  it('flags each missing field independently', () => {
    expect(getMetadataGaps({})).toEqual(['genre', 'year', 'artwork', 'artist']);
    expect(getMetadataGaps({ genres: [{ name: '  ' }], year: 0 })).toContain('genre');
  });

  it('treats optimized-only artwork as present and missing album as fine', () => {
    const gaps = getMetadataGaps({
      genres: [{ name: 'Pop' }],
      year: 2020,
      artworkPaths: { optimizedArtworkPath: 'nora://art/opt' },
      artists: [{ name: 'A' }]
    });
    expect(gaps).toEqual([]);
  });
});
