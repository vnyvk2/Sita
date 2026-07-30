import type { PlaylistEngine } from '../../collections/engine/PlaylistEngine';
import type { PlaylistPersistence, PlaylistEntryWriteModel } from '../interfaces/PlaylistPersistence';

export class EnginePlaylistPersistence implements PlaylistPersistence {
  constructor(private engine: PlaylistEngine) {}

  async createPlaylist(name: string, description?: string): Promise<number> {
    return await this.engine.createPlaylist({ name, description });
  }

  async addEntries(playlistId: number, entries: PlaylistEntryWriteModel[]): Promise<void> {
    if (entries.length === 0) return;
    const songIds = entries.map((e) => e.songId);
    await this.engine.addSongs({ playlistId, songIds });
  }

  async deletePlaylist(playlistId: number): Promise<void> {
    await this.engine.deletePlaylist({ playlistId });
  }
}
