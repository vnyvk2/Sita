import type { PlaylistConflict } from '../models/PlaylistConflict';
import type { SyncOperation } from '../models/SyncOperation';

export interface ConflictResolutionStrategy {
  readonly name: string;
  resolve(conflict: PlaylistConflict, operations: SyncOperation[]): SyncOperation[];
}
