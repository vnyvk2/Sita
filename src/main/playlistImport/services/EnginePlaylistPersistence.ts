import { collectionEventBus } from '../../collections/events/CollectionEventBus';
import type { PlaylistEngine } from '../../collections/engine/PlaylistEngine';
import type { PlaylistRepository } from '../../collections/repositories/PlaylistRepository';
import type { PlaylistPersistence, PlaylistEntryWriteModel } from '../interfaces/PlaylistPersistence';
import type { PlaylistUndoPersistence } from '../interfaces/PlaylistUndoPersistence';

export class EnginePlaylistPersistence implements PlaylistPersistence, PlaylistUndoPersistence {
  constructor(
    private engine: PlaylistEngine,
    private repository?: PlaylistRepository
  ) {}

  async createPlaylist(name: string, _description?: string): Promise<number> {
    return await this.engine.createPlaylist({ name });
  }

  async addEntries(playlistId: number, entries: PlaylistEntryWriteModel[]): Promise<void> {
    if (entries.length === 0) return;
    const songIds = entries.map((e) => e.songId);
    await this.engine.addSongs({ playlistId, songIds });
  }

  async clearEntries(playlistId: number): Promise<void> {
    if (this.repository) {
      await this.repository.clearPlaylistEntries(playlistId);
      collectionEventBus.emitEvent({
        type: 'CollectionChanged',
        payload: { collectionId: playlistId, action: 'removeSongs' }
      });
    }
  }

  async deletePlaylist(playlistId: number): Promise<void> {
    await this.engine.deletePlaylist({ playlistId });
  }
}
