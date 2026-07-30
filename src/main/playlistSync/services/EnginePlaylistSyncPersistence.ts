import type { PlaylistEngine } from '../../collections/engine/PlaylistEngine';
import type { PlaylistSyncPersistence } from '../interfaces/PlaylistSyncPersistence';
import type { PlaylistEntryWriteModel } from '../../playlistImport/interfaces/PlaylistPersistence';

export class EnginePlaylistSyncPersistence implements PlaylistSyncPersistence {
  constructor(private engine: PlaylistEngine) {}

  async addEntries(playlistId: number, entries: PlaylistEntryWriteModel[]): Promise<void> {
    if (entries.length === 0) return;
    const songIds = entries.map((e) => e.songId);
    await this.engine.addSongs({ playlistId, songIds });
  }

  async removeEntries(playlistId: number, songIds: number[]): Promise<void> {
    if (songIds.length === 0) return;
    await this.engine.removeSongs({ playlistId, songIds });
  }

  async reorderEntries(playlistId: number, songIdsInOrder: number[]): Promise<void> {
    await this.engine.reorderPlaylist({ playlistId, songIds: songIdsInOrder });
  }
}
