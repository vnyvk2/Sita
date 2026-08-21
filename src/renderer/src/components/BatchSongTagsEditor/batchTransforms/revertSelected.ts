import type { EditableField } from '../types';
import { getTargetRowIds } from './transformHelpers';
import type { BatchTransformContext, BatchTransformResult } from './types';

/**
 * Pure transformation that restores selected rows to their snapshot original baseline,
 * clearing their dirty fields and validation errors.
 */
export function revertSelected(context: BatchTransformContext): BatchTransformResult {
  const { rows } = context;
  const targetIds = getTargetRowIds(context, false);

  if (targetIds.length === 0) {
    return { rows, changedSongIds: [], totalFieldsChanged: 0 };
  }

  const targetIdSet = new Set(targetIds);
  let totalFieldsChanged = 0;
  const changedSongIds: number[] = [];

  const updatedRows = rows.map((row) => {
    if (!targetIdSet.has(row.songId) || row.dirtyFields.size === 0) {
      return row;
    }

    const fieldsCount = row.dirtyFields.size;
    totalFieldsChanged += fieldsCount;
    changedSongIds.push(row.songId);

    const orig = row.original;
    return {
      songId: row.songId,
      path: row.path,
      duration: row.duration,
      original: orig,
      draft: {
        ...orig,
        artists: [...orig.artists],
        albumArtists: [...orig.albumArtists],
        genres: [...orig.genres]
      },
      dirtyFields: new Set<EditableField>(),
      validationErrors: new Map<EditableField, string>()
    };
  });

  return {
    rows: updatedRows,
    changedSongIds,
    totalFieldsChanged
  };
}
