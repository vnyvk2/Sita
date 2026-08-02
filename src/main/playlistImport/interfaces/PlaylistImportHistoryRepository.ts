import type { PlaylistImportSession } from '../models/PlaylistImportSession';

export interface PlaylistImportHistoryRepository {
  saveSession(session: PlaylistImportSession): Promise<void>;
  getSession(id: string): Promise<PlaylistImportSession | null>;
  listSessions(): Promise<PlaylistImportSession[]>;
  deleteSession(id: string): Promise<void>;
  updateSession(session: PlaylistImportSession): Promise<void>;
}
