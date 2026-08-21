import type { BatchTrackRow, EditableField } from '../types';
import { isFieldDirty, validateField } from '../utils';
import type { BatchTransformContext } from './types';

/**
 * Deep clones a BatchTrackRow, creating a fresh draft object, dirtyFields set, and validationErrors map.
 * The original snapshot baseline remains strictly untouched.
 */
export function cloneRow(row: BatchTrackRow): BatchTrackRow {
  return {
    songId: row.songId,
    path: row.path,
    duration: row.duration,
    original: row.original,
    draft: {
      ...row.draft,
      artists: [...row.draft.artists],
      albumArtists: [...row.draft.albumArtists],
      genres: [...row.draft.genres]
    },
    dirtyFields: new Set(row.dirtyFields),
    validationErrors: new Map(row.validationErrors)
  };
}

/**
 * Applies an updated field value to a row draft and recomputes dirty status and validation.
 * Returns true if the value changed relative to the previous draft value.
 */
export function applyFieldChange(
  row: BatchTrackRow,
  field: EditableField,
  value: unknown
): boolean {
  const previousValue = row.draft[field];

  // Compare previous vs new draft value
  let isDifferentFromPrevious = false;
  if (Array.isArray(previousValue) && Array.isArray(value)) {
    isDifferentFromPrevious =
      previousValue.length !== value.length ||
      previousValue.some((item, idx) => item !== value[idx]);
  } else {
    isDifferentFromPrevious = previousValue !== value;
  }

  if (!isDifferentFromPrevious) {
    return false;
  }

  // Update draft field
  (row.draft as any)[field] = value;

  // Recompute dirty state against original snapshot
  const dirty = isFieldDirty(field, row.original, row.draft);
  if (dirty) {
    row.dirtyFields.add(field);
  } else {
    row.dirtyFields.delete(field);
  }

  // Recompute validation error
  const error = validateField(field, value);
  if (error) {
    row.validationErrors.set(field, error);
  } else {
    row.validationErrors.delete(field);
  }

  return true;
}

/**
 * Resolves the target song IDs for a transform respecting visual table sort order.
 */
export function getTargetRowIds(
  context: BatchTransformContext,
  allowAllWhenNoneSelected = false
): number[] {
  const { selectedSongIds, sortedSongIds, rows } = context;

  // Use sortedSongIds if provided, falling back to rows order
  const orderedIds =
    sortedSongIds && sortedSongIds.length > 0
      ? sortedSongIds
      : rows.map((r) => r.songId);

  if (selectedSongIds.size > 0) {
    return orderedIds.filter((id) => selectedSongIds.has(id));
  }

  if (allowAllWhenNoneSelected) {
    return [...orderedIds];
  }

  return [];
}
