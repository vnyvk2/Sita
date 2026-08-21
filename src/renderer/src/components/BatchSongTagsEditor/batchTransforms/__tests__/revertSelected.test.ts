import { describe, expect, it } from 'vitest';
import { revertSelected } from '../revertSelected';
import type { BatchTransformContext } from '../types';
import type { BatchTrackRow } from '../../types';

describe('batchTransforms — revertSelected', () => {
  it('reverts only selected dirty rows back to snapshot baseline and preserves unselected edits', () => {
    const original1 = {
      songId: 1,
      path: 'C:/song1.mp3',
      duration: 180,
      title: 'Original Title 1',
      artists: ['Orig Artist'],
      albumArtists: [],
      album: 'Orig Album',
      genres: ['Rock']
    };

    const original2 = {
      songId: 2,
      path: 'C:/song2.mp3',
      duration: 200,
      title: 'Original Title 2',
      artists: ['Orig Artist'],
      albumArtists: [],
      album: 'Orig Album',
      genres: ['Pop']
    };

    const rows: BatchTrackRow[] = [
      {
        songId: 1,
        path: original1.path,
        duration: original1.duration,
        original: original1,
        draft: { ...original1, title: 'Dirty Title 1', artists: ['Modified Artist'] },
        dirtyFields: new Set(['title', 'artists']),
        validationErrors: new Map()
      },
      {
        songId: 2,
        path: original2.path,
        duration: original2.duration,
        original: original2,
        draft: { ...original2, title: 'Dirty Title 2' },
        dirtyFields: new Set(['title']),
        validationErrors: new Map()
      }
    ];

    // Revert ONLY song 1
    const context: BatchTransformContext = {
      rows,
      selectedSongIds: new Set([1]),
      sortedSongIds: [1, 2]
    };

    const result = revertSelected(context);

    expect(result.changedSongIds).toEqual([1]);

    const r1 = result.rows.find((r) => r.songId === 1)!;
    const r2 = result.rows.find((r) => r.songId === 2)!;

    // Song 1 must be reverted to original
    expect(r1.draft.title).toBe('Original Title 1');
    expect(r1.draft.artists).toEqual(['Orig Artist']);
    expect(r1.dirtyFields.size).toBe(0);

    // Song 2 was not selected and must keep its dirty modifications
    expect(r2.draft.title).toBe('Dirty Title 2');
    expect(r2.dirtyFields.has('title')).toBe(true);
  });
});
