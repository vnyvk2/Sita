import { parseStringList } from '../utils';
import { applyFieldChange, cloneRow, getTargetRowIds } from './transformHelpers';
import type { BatchTransformContext, BatchTransformResult, BulkApplyConfig } from './types';

/**
 * Pure transformation to set or clear one or multiple metadata fields across target rows.
 */
export function bulkApply(
  context: BatchTransformContext,
  config: BulkApplyConfig
): BatchTransformResult {
  const { rows } = context;
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);

  if (targetIds.length === 0 || config.operations.length === 0) {
    return { rows, changedSongIds: [], totalFieldsChanged: 0 };
  }

  const targetIdSet = new Set(targetIds);
  let totalFieldsChanged = 0;
  const changedSongIds: number[] = [];

  const updatedRows = rows.map((row) => {
    if (!targetIdSet.has(row.songId)) {
      return row;
    }

    const cloned = cloneRow(row);
    let rowChanged = false;

    for (const op of config.operations) {
      let finalValue: unknown;

      if (op.type === 'clear') {
        if (op.field === 'artists' || op.field === 'albumArtists' || op.field === 'genres') {
          finalValue = [];
        } else if (op.field === 'title' || op.field === 'album' || op.field === 'composer') {
          finalValue = '';
        } else {
          finalValue = undefined;
        }
      } else {
        // Set value
        if (op.field === 'artists' || op.field === 'albumArtists' || op.field === 'genres') {
          finalValue = typeof op.value === 'string' ? parseStringList(op.value) : (op.value || []);
        } else if (op.field === 'trackNumber' || op.field === 'discNumber' || op.field === 'year') {
          finalValue = op.value === '' || op.value === undefined || op.value === null ? undefined : Number(op.value);
        } else {
          finalValue = op.value ?? '';
        }
      }

      if (applyFieldChange(cloned, op.field, finalValue)) {
        rowChanged = true;
        totalFieldsChanged++;
      }
    }

    if (rowChanged) {
      changedSongIds.push(row.songId);
      return cloned;
    }

    return row;
  });

  return {
    rows: updatedRows,
    changedSongIds,
    totalFieldsChanged
  };
}
