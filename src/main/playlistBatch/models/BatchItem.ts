export type BatchItemAction = 'IMPORT' | 'SYNC';
export type BatchItemStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED' | 'SKIPPED';

export interface BatchItem {
  id: string;
  action: BatchItemAction;
  sourceFile: string;
  playlistId?: number;
  status: BatchItemStatus;
  dependencies: string[];
  error?: string;
}
