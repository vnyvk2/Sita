import { describe, expect, it } from 'vitest';

import type { BatchTrackRow } from '../../types';
import { autoNumber } from '../autoNumber';
import type { BatchTransformContext } from '../types';

function createMockRow(songId: number, trackNumber?: number): BatchTrackRow {
  const data = {
    songId,
    path: `C:/Music/song${songId}.mp3`,
    duration: 180,
    title: `Song ${songId}`,
    artists: ['Artist A'],
    albumArtists: [],
    album: 'Album 1',
    genres: ['Pop'],
    trackNumber
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

describe('batchTransforms — autoNumber', () => {
  it('auto-numbers all tracks sequentially according to sorted visual order', () => {
    // Simulating visual sort order: song 3, then song 1, then song 2
    const rows = [createMockRow(1, 10), createMockRow(2, 20), createMockRow(3, 30)];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set(),
      sortedSongIds: [3, 1, 2] // Visual order
    };

    const result = autoNumber(context, { startNumber: 1 });

    expect(result.changedSongIds).toEqual([1, 2, 3]);
    expect(result.totalFieldsChanged).toBe(3);

    const r3 = result.rows.find((r) => r.songId === 3)!;
    const r1 = result.rows.find((r) => r.songId === 1)!;
    const r2 = result.rows.find((r) => r.songId === 2)!;

    expect(r3.draft.trackNumber).toBe(1);
    expect(r1.draft.trackNumber).toBe(2);
    expect(r2.draft.trackNumber).toBe(3);

    expect(r3.dirtyFields.has('trackNumber')).toBe(true);
    expect(r1.dirtyFields.has('trackNumber')).toBe(true);
    expect(r2.dirtyFields.has('trackNumber')).toBe(true);
  });

  it('auto-numbers only the selected subset of tracks', () => {
    const rows = [createMockRow(1, 10), createMockRow(2, 20), createMockRow(3, 30)];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1, 3]),
      sortedSongIds: [1, 2, 3]
    };

    const result = autoNumber(context, { startNumber: 1 });

    const r1 = result.rows.find((r) => r.songId === 1)!;
    const r2 = result.rows.find((r) => r.songId === 2)!;
    const r3 = result.rows.find((r) => r.songId === 3)!;

    expect(r1.draft.trackNumber).toBe(1);
    expect(r2.draft.trackNumber).toBe(20); // Unselected remains unchanged
    expect(r3.draft.trackNumber).toBe(2);

    expect(r1.dirtyFields.has('trackNumber')).toBe(true);
    expect(r2.dirtyFields.has('trackNumber')).toBe(false);
    expect(r3.dirtyFields.has('trackNumber')).toBe(true);
  });

  it('applies custom disc number and start index', () => {
    const rows = [createMockRow(1), createMockRow(2)];
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set(),
      sortedSongIds: [1, 2]
    };

    const result = autoNumber(context, { startNumber: 10, discNumber: 2 });

    const r1 = result.rows.find((r) => r.songId === 1)!;
    const r2 = result.rows.find((r) => r.songId === 2)!;

    expect(r1.draft.trackNumber).toBe(10);
    expect(r1.draft.discNumber).toBe(2);
    expect(r2.draft.trackNumber).toBe(11);
    expect(r2.draft.discNumber).toBe(2);
  });
});
