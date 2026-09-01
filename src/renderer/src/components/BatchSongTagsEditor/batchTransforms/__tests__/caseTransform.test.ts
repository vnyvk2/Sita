import { describe, expect, it } from 'vitest';

import type { BatchTrackRow } from '../../types';
import { caseTransform, previewCaseTransform, toSentenceCase, toTitleCase } from '../caseTransform';
import type { BatchTransformContext } from '../types';

describe('batchTransforms — caseTransform', () => {
  it('converts strings to proper Title Case with minor-word and hyphen preservation', () => {
    expect(toTitleCase('the dark side of the moon')).toBe('The Dark Side of the Moon');
    expect(toTitleCase("don't stop believin'")).toBe("Don't Stop Believin'");
    expect(toTitleCase('spider-man: into the spider-verse')).toBe(
      'Spider-Man: Into the Spider-Verse'
    );
    expect(toTitleCase("A HARD DAY'S NIGHT")).toBe("A Hard Day's Night");
    expect(toTitleCase('(live at wembley stadium)')).toBe('(Live at Wembley Stadium)');
    expect(toTitleCase('"heroes" (2017 remaster)')).toBe('"Heroes" (2017 Remaster)');
  });

  it('converts strings to Sentence case', () => {
    expect(toSentenceCase('HELLO WORLD FROM NORA')).toBe('Hello world from nora');
  });

  it('transforms casing across selected rows and generates accurate preview', () => {
    const data = {
      songId: 1,
      path: 'C:/Music/song.mp3',
      duration: 180,
      title: 'all uppercase title',
      artists: ['john doe', 'jane doe'],
      albumArtists: [],
      album: 'greatest hits',
      genres: ['rock']
    };

    const row: BatchTrackRow = {
      songId: 1,
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

    const context: BatchTransformContext = {
      rows: [row],
      selectedSongIds: new Set([1]),
      sortedSongIds: [1]
    };

    const previews = previewCaseTransform(context, {
      mode: 'title',
      targetFields: ['title', 'artists', 'album']
    });

    expect(previews).toHaveLength(3);

    const result = caseTransform(context, {
      mode: 'title',
      targetFields: ['title', 'artists', 'album']
    });

    const transformed = result.rows[0];
    expect(transformed.draft.title).toBe('All Uppercase Title');
    expect(transformed.draft.artists).toEqual(['John Doe', 'Jane Doe']);
    expect(transformed.draft.album).toBe('Greatest Hits');
    expect(transformed.dirtyFields.has('title')).toBe(true);
    expect(transformed.dirtyFields.has('artists')).toBe(true);
    expect(transformed.dirtyFields.has('album')).toBe(true);
  });
});
