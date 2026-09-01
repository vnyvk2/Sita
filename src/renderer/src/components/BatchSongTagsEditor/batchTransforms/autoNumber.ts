import { applyFieldChange, cloneRow, getTargetRowIds } from './transformHelpers';
import type { AutoNumberConfig, BatchTransformContext, BatchTransformResult } from './types';

/** Pure transformation that auto-numbers tracks sequentially in the active visual sort order. */
export function autoNumber(
  context: BatchTransformContext,
  config: AutoNumberConfig = {}
): BatchTransformResult {
  const { rows } = context;
  const startNumber = Math.max(1, config.startNumber ?? 1);
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? true);

  if (targetIds.length === 0) {
    return { rows, changedSongIds: [], totalFieldsChanged: 0 };
  }

  const targetIdMap = new Map<number, number>();
  targetIds.forEach((id, index) => {
    targetIdMap.set(id, startNumber + index);
  });

  let totalFieldsChanged = 0;
  const changedSongIds: number[] = [];

  const updatedRows = rows.map((row) => {
    const nextTrackNum = targetIdMap.get(row.songId);
    if (nextTrackNum === undefined) {
      return row;
    }

    const cloned = cloneRow(row);
    let rowChanged = false;

    if (applyFieldChange(cloned, 'trackNumber', nextTrackNum)) {
      rowChanged = true;
      totalFieldsChanged++;
    }

    if (config.discNumber !== undefined) {
      if (applyFieldChange(cloned, 'discNumber', config.discNumber)) {
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
