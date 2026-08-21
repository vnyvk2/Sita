import { applyFieldChange, cloneRow, getTargetRowIds } from './transformHelpers';
import type {
  BatchTransformContext,
  BatchTransformPreview,
  BatchTransformResult,
  FindReplaceConfig
} from './types';

/**
 * Validates a regex pattern, returning compiled RegExp or syntax error message.
 */
export function validateFindReplaceRegex(
  query: string,
  matchCase: boolean
): { valid: boolean; regex?: RegExp; error?: string } {
  if (!query) {
    return { valid: false, error: 'Search query cannot be empty' };
  }

  try {
    const flags = matchCase ? 'g' : 'gi';
    const regex = new RegExp(query, flags);
    return { valid: true, regex };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : 'Invalid Regular Expression'
    };
  }
}

/**
 * Compiles a search string into a RegExp instance (escaping literals if not isRegex).
 */
function compileSearchPattern(
  query: string,
  isRegex: boolean,
  matchCase: boolean
): RegExp | null {
  if (!query) return null;

  try {
    const pattern = isRegex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const flags = matchCase ? 'g' : 'gi';
    return new RegExp(pattern, flags);
  } catch {
    return null;
  }
}

/**
 * Transforms a single text value or array of strings with search-and-replace.
 */
function replaceValue(
  val: unknown,
  regex: RegExp,
  replacement: string,
  isRegex: boolean
): { changed: boolean; value: unknown } {
  const doReplace = (str: string) =>
    isRegex ? str.replace(regex, replacement) : str.replace(regex, () => replacement);

  if (typeof val === 'string') {
    const next = doReplace(val);
    return { changed: next !== val, value: next };
  }

  if (Array.isArray(val)) {
    let arrayChanged = false;
    const nextArray = val
      .map((item) => {
        if (typeof item === 'string') {
          const next = doReplace(item).trim();
          if (next !== item) arrayChanged = true;
          return next;
        }
        return item;
      })
      .filter((item) => typeof item === 'string' && item.length > 0);

    if (nextArray.length !== val.length) {
      arrayChanged = true;
    }

    return { changed: arrayChanged, value: nextArray };
  }

  return { changed: false, value: val };
}

/**
 * Computes a live before -> after preview of all affected fields for Find & Replace.
 */
export function previewFindReplace(
  context: BatchTransformContext,
  config: FindReplaceConfig
): BatchTransformPreview[] {
  const { rows } = context;
  const isRegex = config.isRegex ?? false;
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);
  const regex = compileSearchPattern(config.query, isRegex, config.matchCase);

  if (targetIds.length === 0 || !regex || config.targetFields.length === 0) {
    return [];
  }

  const targetIdSet = new Set(targetIds);
  const previews: BatchTransformPreview[] = [];

  for (const row of rows) {
    if (!targetIdSet.has(row.songId)) continue;

    for (const field of config.targetFields) {
      const currentVal = row.draft[field];
      const { changed, value: nextVal } = replaceValue(currentVal, regex, config.replacement, isRegex);

      if (changed) {
        previews.push({
          songId: row.songId,
          field,
          before: currentVal,
          after: nextVal
        });
      }
    }
  }

  return previews;
}

/**
 * Pure transformation to execute Find & Replace across target columns and rows.
 */
export function findReplace(
  context: BatchTransformContext,
  config: FindReplaceConfig
): BatchTransformResult {
  const { rows } = context;
  const isRegex = config.isRegex ?? false;
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);
  const regex = compileSearchPattern(config.query, isRegex, config.matchCase);

  if (targetIds.length === 0 || !regex || config.targetFields.length === 0) {
    return { rows, changedSongIds: [], totalFieldsChanged: 0 };
  }

  const targetIdSet = new Set(targetIds);
  let totalFieldsChanged = 0;
  const changedSongIds: number[] = [];

  const updatedRows = rows.map((row) => {
    if (!targetIdSet.has(row.songId)) return row;

    const cloned = cloneRow(row);
    let rowChanged = false;

    for (const field of config.targetFields) {
      const currentVal = cloned.draft[field];
      const { changed, value: nextVal } = replaceValue(currentVal, regex, config.replacement, isRegex);

      if (changed && applyFieldChange(cloned, field, nextVal)) {
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
