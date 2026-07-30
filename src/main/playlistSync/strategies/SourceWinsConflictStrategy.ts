import type { ConflictResolutionStrategy } from '../interfaces/ConflictResolutionStrategy';
import type { PlaylistConflict } from '../models/PlaylistConflict';
import type { SyncOperation } from '../models/SyncOperation';

export class SourceWinsConflictStrategy implements ConflictResolutionStrategy {
  readonly name = 'SourceWins';

  resolve(conflict: PlaylistConflict, operations: SyncOperation[]): SyncOperation[] {
    if (conflict.type === 'DUPLICATE_ENTRY' && conflict.songId !== undefined) {
      let seen = false;
      return operations.filter((op) => {
        if (op.type === 'ADD_SONG' && op.songId === conflict.songId) {
          if (seen) return false;
          seen = true;
        }
        return true;
      });
    }
    return operations;
  }
}
