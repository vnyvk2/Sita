import type { SyncPolicy } from './SyncPolicy';

export interface PlaylistLink {
  id: string;
  playlistId: number;
  sourceFile: string;
  format: string;
  lastImportedAt: Date;
  lastSyncedAt?: Date;
  fileHash?: string;
  syncPolicy: SyncPolicy;
}
