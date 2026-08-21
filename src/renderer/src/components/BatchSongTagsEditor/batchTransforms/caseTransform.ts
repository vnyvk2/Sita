import { applyFieldChange, cloneRow, getTargetRowIds } from './transformHelpers';
import type {
  BatchTransformContext,
  BatchTransformPreview,
  BatchTransformResult,
  CaseConvertMode,
  CaseTransformConfig
} from './types';

const MINOR_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'for', 'nor', 'on', 'at', 'to', 'from', 'by', 'of', 'in', 'with', 'vs', 'v'
]);

/**
 * Converts a string to standard Title Case with minor-word preservation.
 */
export function toTitleCase(input: string): string {
  if (!input) return '';

  // Split by whitespace while preserving punctuation
  const words = input.split(/(\s+)/);
  const nonSpaceIndices: number[] = [];

  words.forEach((w, idx) => {
    if (w.trim().length > 0) {
      nonSpaceIndices.push(idx);
    }
  });

  if (nonSpaceIndices.length === 0) return input;

  const firstIndex = nonSpaceIndices[0];
  const lastIndex = nonSpaceIndices[nonSpaceIndices.length - 1];

  return words
    .map((word, idx) => {
      if (word.trim().length === 0) return word;

      // Handle hyphenated subwords (e.g. "Spider-Man", "state-of-the-art")
      if (word.includes('-')) {
        return word
          .split('-')
          .map((subword, subIdx) => {
            const lower = subword.toLowerCase();
            if (subIdx !== 0 && MINOR_WORDS.has(lower)) {
              return lower;
            }
            return capitalizeWord(subword);
          })
          .join('-');
      }

      const lower = word.toLowerCase();
      const isBoundary = idx === firstIndex || idx === lastIndex;

      if (!isBoundary && MINOR_WORDS.has(lower)) {
        return lower;
      }

      return capitalizeWord(word);
    })
    .join('');
}

function capitalizeWord(word: string): string {
  if (!word) return '';
  // Check for leading quotes or parentheses
  const match = word.match(/^([("'\u2018\u201C]*)(.)(.*)$/);
  if (!match) return word;

  const [, prefix, firstChar, rest] = match;
  return prefix + firstChar.toUpperCase() + rest.toLowerCase();
}

/**
 * Converts string to Sentence case.
 */
export function toSentenceCase(input: string): string {
  if (!input) return '';
  const lower = input.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Applies selected case mode to a string or array of strings.
 */
function transformCase(val: unknown, mode: CaseConvertMode): { changed: boolean; value: unknown } {
  const transformString = (str: string): string => {
    switch (mode) {
      case 'title':
        return toTitleCase(str);
      case 'sentence':
        return toSentenceCase(str);
      case 'upper':
        return str.toUpperCase();
      case 'lower':
        return str.toLowerCase();
      default:
        return str;
    }
  };

  if (typeof val === 'string') {
    const next = transformString(val);
    return { changed: next !== val, value: next };
  }

  if (Array.isArray(val)) {
    let arrayChanged = false;
    const nextArray = val.map((item) => {
      if (typeof item === 'string') {
        const next = transformString(item);
        if (next !== item) arrayChanged = true;
        return next;
      }
      return item;
    });

    return { changed: arrayChanged, value: nextArray };
  }

  return { changed: false, value: val };
}

/**
 * Computes live preview of case conversions across target rows and fields.
 */
export function previewCaseTransform(
  context: BatchTransformContext,
  config: CaseTransformConfig
): BatchTransformPreview[] {
  const { rows } = context;
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);

  if (targetIds.length === 0 || config.targetFields.length === 0) {
    return [];
  }

  const targetIdSet = new Set(targetIds);
  const previews: BatchTransformPreview[] = [];

  for (const row of rows) {
    if (!targetIdSet.has(row.songId)) continue;

    for (const field of config.targetFields) {
      const currentVal = row.draft[field];
      const { changed, value: nextVal } = transformCase(currentVal, config.mode);

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
 * Pure transformation to apply case conversion across target fields and rows.
 */
export function caseTransform(
  context: BatchTransformContext,
  config: CaseTransformConfig
): BatchTransformResult {
  const { rows } = context;
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);

  if (targetIds.length === 0 || config.targetFields.length === 0) {
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
      const { changed, value: nextVal } = transformCase(currentVal, config.mode);

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
