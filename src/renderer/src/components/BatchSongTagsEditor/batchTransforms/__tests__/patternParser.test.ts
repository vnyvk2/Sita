import { describe, expect, it } from 'vitest';
import { compilePattern, extractPathTarget, parsePattern, previewPatternParser } from '../patternParser';
import type { BatchTransformContext } from '../types';
import type { BatchTrackRow } from '../../types';

function createMockRow(songId: number, path: string): BatchTrackRow {
  const data = {
    songId,
    path,
    duration: 180,
    title: '',
    artists: [],
    albumArtists: [],
    album: '',
    genres: []
  };
  return {
    songId,
    path,
    duration: data.duration,
    original: data,
    draft: { ...data, artists: [...data.artists], albumArtists: [...data.albumArtists], genres: [...data.genres] },
    dirtyFields: new Set(),
    validationErrors: new Map()
  };
}

describe('batchTransforms — patternParser', () => {
  it('extracts filename target stripping diverse audio extensions', () => {
    expect(extractPathTarget('C:/Music/01 - Queen - Bohemian Rhapsody.mp3', false)).toBe('01 - Queen - Bohemian Rhapsody');
    expect(extractPathTarget('D:/Audio/Track.flac', false)).toBe('Track');
    expect(extractPathTarget('C:/Music/Album/01 Title.m4a', true)).toBe('C:/Music/Album/01 Title');
  });

  it('compiles token patterns into working regexes', () => {
    const compiled = compilePattern('%track% - %artist% - %title%');
    expect(compiled).not.toBeNull();
    expect(compiled!.tokens).toHaveLength(3);
    expect(compiled!.tokens[0].field).toBe('trackNumber');
    expect(compiled!.tokens[1].field).toBe('artists');
    expect(compiled!.tokens[2].field).toBe('title');
  });

  it('parses tokens from file paths and generates accurate previews and transformations', () => {
    const row1 = createMockRow(1, 'C:/Music/05 - Daft Punk - One More Time.flac');
    const row2 = createMockRow(2, 'C:/Music/06 - Daft Punk - Aerodynamic.mp3');

    const context: BatchTransformContext = {
      rows: [row1, row2],
      selectedSongIds: new Set([1, 2]),
      sortedSongIds: [1, 2]
    };

    const previews = previewPatternParser(context, {
      pattern: '%track% - %artist% - %title%',
      targetFields: ['trackNumber', 'artists', 'title']
    });

    expect(previews).toHaveLength(2);
    expect(previews[0].matched).toBe(true);
    expect(previews[0].fields.trackNumber).toBe(5);
    expect(previews[0].fields.artists).toEqual(['Daft Punk']);
    expect(previews[0].fields.title).toBe('One More Time');

    const result = parsePattern(context, {
      pattern: '%track% - %artist% - %title%',
      targetFields: ['trackNumber', 'artists', 'title']
    });

    const r1 = result.rows[0];
    expect(r1.draft.trackNumber).toBe(5);
    expect(r1.draft.artists).toEqual(['Daft Punk']);
    expect(r1.draft.title).toBe('One More Time');
    expect(r1.dirtyFields.has('trackNumber')).toBe(true);
    expect(r1.dirtyFields.has('artists')).toBe(true);
    expect(r1.dirtyFields.has('title')).toBe(true);
  });

  it('respects selective field overwrite (only modifies selected targetFields)', () => {
    const row = createMockRow(1, 'C:/Music/01 - Artist - Title.mp3');
    row.draft.artists = ['Untouched Artist'];

    const context: BatchTransformContext = {
      rows: [row],
      selectedSongIds: new Set([1]),
      sortedSongIds: [1]
    };

    // User only wants to extract Title from filename, keeping existing artist
    const result = parsePattern(context, {
      pattern: '%track% - %artist% - %title%',
      targetFields: ['title']
    });

    const transformed = result.rows[0];
    expect(transformed.draft.title).toBe('Title');
    expect(transformed.draft.artists).toEqual(['Untouched Artist']);
    expect(transformed.dirtyFields.has('title')).toBe(true);
    expect(transformed.dirtyFields.has('artists')).toBe(false);
  });
});
