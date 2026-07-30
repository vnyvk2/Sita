export type SyncOperationType = 'ADD_SONG' | 'REMOVE_SONG' | 'REORDER';

export interface SyncOperation {
  type: SyncOperationType;
  songId?: number;
  position?: number;
  targetPosition?: number;
  reason: string;
}
