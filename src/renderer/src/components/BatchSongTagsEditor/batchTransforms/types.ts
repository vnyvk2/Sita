import type { BatchTrackRow, EditableField } from '../types';

export interface BatchTransformContext {
  rows: BatchTrackRow[];
  selectedSongIds: Set<number>;
  sortedSongIds: number[];
}

export interface BatchTransformResult {
  rows: BatchTrackRow[];
  changedSongIds: number[];
  totalFieldsChanged: number;
}

export interface BatchTransformPreview {
  songId: number;
  field: EditableField;
  before: unknown;
  after: unknown;
}

export interface AutoNumberConfig {
  startNumber?: number;
  discNumber?: number;
  allowAllWhenNoneSelected?: boolean;
}

export interface BulkFieldOperation {
  field: EditableField;
  type: 'set' | 'clear';
  value?: unknown;
}

export interface BulkApplyConfig {
  operations: BulkFieldOperation[];
  allowAllWhenNoneSelected?: boolean;
}

export interface FindReplaceConfig {
  query: string;
  replacement: string;
  isRegex: boolean;
  matchCase: boolean;
  targetFields: EditableField[];
  allowAllWhenNoneSelected?: boolean;
}

export type CaseConvertMode = 'title' | 'sentence' | 'upper' | 'lower';

export interface CaseTransformConfig {
  mode: CaseConvertMode;
  targetFields: EditableField[];
  allowAllWhenNoneSelected?: boolean;
}

export interface PatternParserConfig {
  pattern: string;
  targetFields: EditableField[];
  allowAllWhenNoneSelected?: boolean;
}

export interface PatternParseRowPreview {
  songId: number;
  path: string;
  matched: boolean;
  fields: Partial<Record<EditableField, unknown>>;
}
