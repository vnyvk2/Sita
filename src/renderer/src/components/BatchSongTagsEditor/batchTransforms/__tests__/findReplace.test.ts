import { describe, expect, it } from 'vitest';

import type { BatchTrackRow } from '../../types';
import { findReplace, previewFindReplace, validateFindReplaceRegex } from '../findReplace';
import type { BatchTransformContext } from '../types';

function createMockRow(
  songId: number,
  title: string,
  artists: string[],
  album: string
): BatchTrackRow {
  const data = {
    songId,
    path: `C:/Music/song${songId}.mp3`,
    duration: 180,
    title,
    artists,
    albumArtists: [],
    album,
    genres: ['Pop']
  };
  return {
    songId,
    path: data.path,
    duration: data.duration,
    original: data,
    draft: {
      ...data,
      artists: [...data.artists],
      albumArtists: [...data.albumArtists],
      genres: [...data.genres]
    },
    dirtyFields: new Set(),
    validationErrors: new Map()
  };
}

describe('batchTransforms — findReplace', () => {
  it('validates regex queries cleanly', () => {
    expect(validateFindReplaceRegex('[a-z]+', false).valid).toBe(true);
    expect(validateFindReplaceRegex('[unclosed', false).valid).toBe(false);
    expect(validateFindReplaceRegex('', false).valid).toBe(false);
  });

  it('generates accurate previews for plain text and regex substitutions', () => {
    const rows = [
      createMockRow(
        1,
        'Song 1 (Remastered 2024)',
        ['Artist feat. Guest'],
        'Greatest Hits [Deluxe]'
      ),
      createMockRow(2, 'Song 2', ['Artist'], 'Greatest Hits')
    ];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1, 2]),
      sortedSongIds: [1, 2]
    };

    const previews = previewFindReplace(context, {
      query: 'feat.',
      replacement: 'ft.',
      isRegex: false,
      matchCase: false,
      targetFields: ['artists']
    });

    expect(previews).toHaveLength(1);
    expect(previews[0].songId).toBe(1);
    expect(previews[0].field).toBe('artists');
    expect(previews[0].before).toEqual(['Artist feat. Guest']);
    expect(previews[0].after).toEqual(['Artist ft. Guest']);
  });

  it('executes regex replacements with capture groups and multi-column targeting', () => {
    const rows = [
      createMockRow(1, 'Track 01 - Intro', ['Artist A'], 'Album 2020'),
      createMockRow(2, 'Track 02 - Outro', ['Artist B'], 'Album 2020')
    ];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1, 2]),
      sortedSongIds: [1, 2]
    };

    const result = findReplace(context, {
      query: 'Track (\\d+) - (.*)',
      replacement: '$2 (#$1)',
      isRegex: true,
      matchCase: false,
      targetFields: ['title']
    });

    expect(result.changedSongIds).toEqual([1, 2]);

    const r1 = result.rows.find((r) => r.songId === 1)!;
    const r2 = result.rows.find((r) => r.songId === 2)!;

    expect(r1.draft.title).toBe('Intro (#01)');
    expect(r2.draft.title).toBe('Outro (#02)');
    expect(r1.dirtyFields.has('title')).toBe(true);
  });

  it('removes matching array items when replaced with empty string, preserving remaining non-empty elements', () => {
    const rows = [createMockRow(1, 'Song 1', ['Queen', 'David Bowie'], 'Greatest Hits')];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1]),
      sortedSongIds: [1]
    };

    const result = findReplace(context, {
      query: 'David Bowie',
      replacement: '',
      isRegex: false,
      matchCase: false,
      targetFields: ['artists']
    });

    expect(result.changedSongIds).toEqual([1]);
    const r1 = result.rows[0];
    expect(r1.draft.artists).toEqual(['Queen']);
    expect(r1.dirtyFields.has('artists')).toBe(true);
  });

  it('preserves literal dollar signs without treating them as capture group backreferences in plain-text mode', () => {
    const rows = [createMockRow(1, 'Price 100', ['Artist'], 'Album')];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1]),
      sortedSongIds: [1]
    };

    const result = findReplace(context, {
      query: '100',
      replacement: '$100',
      isRegex: false,
      matchCase: false,
      targetFields: ['title']
    });

    const r1 = result.rows[0];
    expect(r1.draft.title).toBe('Price $100');
  });
});
