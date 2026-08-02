import type { PlaylistImportHistoryRepository } from '../interfaces/PlaylistImportHistoryRepository';
import type { PlaylistImportSession } from '../models/PlaylistImportSession';

export class InMemoryPlaylistImportHistoryRepository implements PlaylistImportHistoryRepository {
  private sessions = new Map<string, PlaylistImportSession>();

  async saveSession(session: PlaylistImportSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }

  async getSession(id: string): Promise<PlaylistImportSession | null> {
    const session = this.sessions.get(id);
    return session ? { ...session } : null;
  }

  async listSessions(): Promise<PlaylistImportSession[]> {
    return Array.from(this.sessions.values()).map((s) => ({ ...s }));
  }

  async deleteSession(id: string): Promise<void> {
    this.sessions.delete(id);
  }

  async updateSession(session: PlaylistImportSession): Promise<void> {
    this.sessions.set(session.id, { ...session });
  }
}
