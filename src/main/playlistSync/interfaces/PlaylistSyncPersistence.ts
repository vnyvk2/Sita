import type { PlaylistEntryWriteModel } from '../../playlistImport/interfaces/PlaylistPersistence';

export interface PlaylistSyncPersistence {
  addEntries(playlistId: number, entries: PlaylistEntryWriteModel[]): Promise<void>;
  removeEntries(playlistId: number, songIds: number[]): Promise<void>;
  reorderEntries(playlistId: number, songIdsInOrder: number[]): Promise<void>;
}
