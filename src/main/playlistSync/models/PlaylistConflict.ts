export type ConflictType =
  | 'LOCAL_MODIFIED'
  | 'SOURCE_MODIFIED'
  | 'BOTH_MODIFIED'
  | 'DUPLICATE_ENTRY'
  | 'MISSING_SONG'
  | 'LOW_CONFIDENCE_MATCH'
  | 'REORDER_CONFLICT';

export type ConflictSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface PlaylistConflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  songId?: number;
  reason: string;
  requiresUserDecision: boolean;
}
