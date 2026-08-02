export type OverrideType = 'SELECT_CANDIDATE' | 'FORCE_SKIP' | 'FORCE_IMPORT' | 'RESOLVE_CONFLICT';

export interface UserOverride {
  id: string;
  entryPosition: number;
  type: OverrideType;
  selectedSongId?: number;
  conflictResolutionChoice?: 'SOURCE_WINS' | 'KEEP_LOCAL' | 'SKIP';
  reason?: string;
}
