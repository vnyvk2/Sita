import type { ConflictResolutionStrategy } from '../interfaces/ConflictResolutionStrategy';
import type { PlaylistConflict } from '../models/PlaylistConflict';
import type { SyncOperation } from '../models/SyncOperation';

export class KeepLocalConflictStrategy implements ConflictResolutionStrategy {
  readonly name = 'KeepLocal';

  resolve(conflict: PlaylistConflict, operations: SyncOperation[]): SyncOperation[] {
    if (conflict.type === 'LOCAL_MODIFIED' && conflict.songId !== undefined) {
      return operations.filter(
        (op) => !(op.type === 'REMOVE_SONG' && op.songId === conflict.songId)
      );
    }
    return operations;
  }
}
