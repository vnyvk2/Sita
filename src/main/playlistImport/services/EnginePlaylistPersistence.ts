import { db } from '../../db/db';
import type { PlaylistEngine } from '../../collections/engine/PlaylistEngine';
import type { PlaylistPersistence } from '../interfaces/PlaylistPersistence';

export class EnginePlaylistPersistence implements PlaylistPersistence {
  constructor(private engine: PlaylistEngine) {}

  async createPlaylist(name: string, description?: string): Promise<number> {
    return await this.engine.createPlaylist({ name, description });
  }

  async addEntries(playlistId: number, songIds: number[]): Promise<void> {
    if (songIds.length === 0) return;
    await this.engine.addSongs({ playlistId, songIds });
  }

  async runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    return await db.transaction(async () => {
      return await work();
    });
  }
}
