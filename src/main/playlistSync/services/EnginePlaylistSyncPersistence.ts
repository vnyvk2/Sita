import type { PlaylistEngine } from '../../collections/engine/PlaylistEngine';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import type { PlaylistSyncPersistence } from '../interfaces/PlaylistSyncPersistence';
import type { PlaylistEntryWriteModel } from '../../playlistImport/interfaces/PlaylistPersistence';

export class EnginePlaylistSyncPersistence implements PlaylistSyncPersistence {
  constructor(
    private engine: PlaylistEngine,
    private repository?: PlaylistRepository
  ) {}

  async addEntries(playlistId: number, entries: PlaylistEntryWriteModel[]): Promise<void> {
    if (entries.length === 0) return;
    const songIds = entries.map((e) => e.songId);
    await this.engine.addSongs({ playlistId, songIds });
  }

  async removeEntries(playlistId: number, songIds: number[]): Promise<void> {
    if (songIds.length === 0) return;
    if (this.repository) {
      const existingEntries = await this.repository.getEntries(playlistId);
      const entryIdsToRemove = existingEntries
        .filter((e) => songIds.includes(e.entry.songId))
        .map((e) => e.entry.id);

      if (entryIdsToRemove.length > 0) {
        await this.engine.removeSongs({ playlistId, entryIds: entryIdsToRemove });
      }
    }
  }

  async reorderEntries(_playlistId: number, _songIdsInOrder: number[]): Promise<void> {
    // Reorder placeholder for sync persistence
  }
}
