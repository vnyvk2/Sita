import type { EditableField } from '../types';
import { parseStringList } from '../utils';
import { applyFieldChange, cloneRow, getTargetRowIds } from './transformHelpers';
import type {
  BatchTransformContext,
  BatchTransformResult,
  PatternParserConfig,
  PatternParseRowPreview
} from './types';

const TOKEN_MAP: Record<string, EditableField> = {
  '%track%': 'trackNumber',
  '%disc%': 'discNumber',
  '%title%': 'title',
  '%artist%': 'artists',
  '%albumartist%': 'albumArtists',
  '%album%': 'album',
  '%genre%': 'genres',
  '%year%': 'year',
  '%composer%': 'composer'
};

export interface CompiledPattern {
  regex: RegExp;
  tokens: Array<{ token: string; field: EditableField }>;
  isPathPattern: boolean;
}

/**
 * Compiles a user pattern string (e.g. "%track% - %artist% - %title%") into a RegExp with capture groups.
 */
export function compilePattern(pattern: string): CompiledPattern | null {
  if (!pattern || pattern.trim() === '') return null;

  const isPathPattern = pattern.includes('/') || pattern.includes('\\');
  const tokens: Array<{ token: string; field: EditableField }> = [];

  // Match all %token% placeholders
  const tokenRegex = /(%[a-zA-Z]+%)/g;
  let lastIndex = 0;
  let regexStr = '^';
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(pattern)) !== null) {
    const rawToken = match[1].toLowerCase();
    const field = TOKEN_MAP[rawToken];

    // Escape preceding literal characters
    const literal = pattern.substring(lastIndex, match.index);
    regexStr += escapeRegex(literal);

    if (field) {
      tokens.push({ token: rawToken, field });
      // Non-greedy capture for the token
      regexStr += '(.+?)';
    } else {
      // Unknown token, treat as literal
      regexStr += escapeRegex(match[1]);
    }

    lastIndex = match.index + match[0].length;
  }

  // Escape trailing literal characters
  const trailing = pattern.substring(lastIndex);
  regexStr += escapeRegex(trailing) + '$';

  try {
    const regex = new RegExp(regexStr, 'i');
    return { regex, tokens, isPathPattern };
  } catch {
    return null;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts target string from path (basename without extension or normalized path).
 */
export function extractPathTarget(filePath: string, isPathPattern: boolean): string {
  if (!filePath) return '';

  // Normalize path separators to forward slash
  const normalized = filePath.replace(/\\/g, '/');

  if (isPathPattern) {
    // Strip trailing audio extension
    return normalized.replace(/\.[a-zA-Z0-9]+$/, '');
  }

  // Basename only
  const parts = normalized.split('/');
  const filename = parts[parts.length - 1] || '';
  return filename.replace(/\.[a-zA-Z0-9]+$/, '');
}

/**
 * Parses raw captured token value into typed metadata value.
 */
function parseTokenValue(field: EditableField, rawValue: string): unknown {
  const trimmed = rawValue.trim();

  if (field === 'trackNumber' || field === 'discNumber') {
    // Handle track/total notation like "01/12"
    const match = trimmed.match(/^(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      return num >= 1 ? num : undefined;
    }
    return undefined;
  }

  if (field === 'year') {
    const match = trimmed.match(/\b(19\d\d|20\d\d)\b/);
    if (match) {
      return parseInt(match[1], 10);
    }
    return undefined;
  }

  if (field === 'artists' || field === 'albumArtists' || field === 'genres') {
    return parseStringList(trimmed);
  }

  return trimmed;
}

/**
 * Computes live match previews for pattern parser across target rows.
 */
export function previewPatternParser(
  context: BatchTransformContext,
  config: PatternParserConfig
): PatternParseRowPreview[] {
  const { rows } = context;
  const compiled = compilePattern(config.pattern);
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);

  if (targetIds.length === 0 || !compiled) {
    return [];
  }

  const targetIdSet = new Set(targetIds);
  const selectedFieldsSet = new Set(config.targetFields);
  const previews: PatternParseRowPreview[] = [];

  for (const row of rows) {
    if (!targetIdSet.has(row.songId)) continue;

    const targetStr = extractPathTarget(row.path, compiled.isPathPattern);
    const match = compiled.regex.exec(targetStr);

    if (match) {
      const fields: Partial<Record<EditableField, unknown>> = {};

      compiled.tokens.forEach(({ field }, idx) => {
        if (selectedFieldsSet.has(field)) {
          const rawVal = match[idx + 1] || '';
          fields[field] = parseTokenValue(field, rawVal);
        }
      });

      previews.push({
        songId: row.songId,
        path: row.path,
        matched: true,
        fields
      });
    } else {
      previews.push({
        songId: row.songId,
        path: row.path,
        matched: false,
        fields: {}
      });
    }
  }

  return previews;
}

/**
 * Pure transformation that extracts metadata from file paths into row drafts.
 */
export function parsePattern(
  context: BatchTransformContext,
  config: PatternParserConfig
): BatchTransformResult {
  const { rows } = context;
  const compiled = compilePattern(config.pattern);
  const targetIds = getTargetRowIds(context, config.allowAllWhenNoneSelected ?? false);

  if (targetIds.length === 0 || !compiled || config.targetFields.length === 0) {
    return { rows, changedSongIds: [], totalFieldsChanged: 0 };
  }

  const targetIdSet = new Set(targetIds);
  const selectedFieldsSet = new Set(config.targetFields);
  let totalFieldsChanged = 0;
  const changedSongIds: number[] = [];

  const updatedRows = rows.map((row) => {
    if (!targetIdSet.has(row.songId)) return row;

    const targetStr = extractPathTarget(row.path, compiled.isPathPattern);
    const match = compiled.regex.exec(targetStr);
    if (!match) return row;

    const cloned = cloneRow(row);
    let rowChanged = false;

    compiled.tokens.forEach(({ field }, idx) => {
      if (selectedFieldsSet.has(field)) {
        const rawVal = match[idx + 1] || '';
        const parsedVal = parseTokenValue(field, rawVal);

        if (parsedVal !== undefined && applyFieldChange(cloned, field, parsedVal)) {
          rowChanged = true;
          totalFieldsChanged++;
        }
      }
    });

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
