import { describe, expect, it } from 'vitest';

import type { BatchTrackRow } from '../../types';
import { bulkApply } from '../bulkApply';
import type { BatchTransformContext } from '../types';

function createMockRow(songId: number): BatchTrackRow {
  const data = {
    songId,
    path: `C:/Music/song${songId}.mp3`,
    duration: 180,
    title: `Song ${songId}`,
    artists: ['Old Artist'],
    albumArtists: [],
    album: 'Old Album',
    genres: ['Rock'],
    year: 2020
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

describe('batchTransforms — bulkApply', () => {
  it('sets multiple fields across selected rows and leaves unselected rows unchanged', () => {
    const rows = [createMockRow(1), createMockRow(2), createMockRow(3)];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1, 2]),
      sortedSongIds: [1, 2, 3]
    };

    const result = bulkApply(context, {
      operations: [
        { type: 'set', field: 'artists', value: 'New Artist 1, New Artist 2' },
        { type: 'set', field: 'album', value: 'Unified Album' },
        { type: 'set', field: 'year', value: 2024 }
      ]
    });

    expect(result.changedSongIds).toEqual([1, 2]);

    const r1 = result.rows.find((r) => r.songId === 1)!;
    const r2 = result.rows.find((r) => r.songId === 2)!;
    const r3 = result.rows.find((r) => r.songId === 3)!;

    expect(r1.draft.artists).toEqual(['New Artist 1', 'New Artist 2']);
    expect(r1.draft.album).toBe('Unified Album');
    expect(r1.draft.year).toBe(2024);
    expect(r1.dirtyFields.has('artists')).toBe(true);
    expect(r1.dirtyFields.has('album')).toBe(true);
    expect(r1.dirtyFields.has('year')).toBe(true);

    expect(r2.draft.artists).toEqual(['New Artist 1', 'New Artist 2']);
    expect(r2.draft.album).toBe('Unified Album');

    // Row 3 was unselected and must remain completely untouched
    expect(r3.draft.artists).toEqual(['Old Artist']);
    expect(r3.draft.album).toBe('Old Album');
    expect(r3.dirtyFields.size).toBe(0);
  });

  it('clears specified fields cleanly across selected rows', () => {
    const rows = [createMockRow(1)];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1]),
      sortedSongIds: [1]
    };

    const result = bulkApply(context, {
      operations: [
        { type: 'clear', field: 'album' },
        { type: 'clear', field: 'genres' },
        { type: 'clear', field: 'year' }
      ]
    });

    const r1 = result.rows[0];
    expect(r1.draft.album).toBe('');
    expect(r1.draft.genres).toEqual([]);
    expect(r1.draft.year).toBeUndefined();
    expect(r1.dirtyFields.has('album')).toBe(true);
    expect(r1.dirtyFields.has('genres')).toBe(true);
    expect(r1.dirtyFields.has('year')).toBe(true);
  });
});
