export interface PlaylistPersistence {
  createPlaylist(name: string, description?: string): Promise<number>;
  addEntries(playlistId: number, songIds: number[]): Promise<void>;
  runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
