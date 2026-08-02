import type { SyncOperation } from './SyncOperation';
import type { SyncPolicy } from './SyncPolicy';

export interface PlaylistSyncPlan {
  linkId: string;
  playlistId: number;
  sourceFile: string;
  syncPolicy: SyncPolicy;
  operations: SyncOperation[];
  hasChanges: boolean;
  additionsCount: number;
  removalsCount: number;
}
