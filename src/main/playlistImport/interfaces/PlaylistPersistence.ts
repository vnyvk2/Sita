export interface PlaylistEntryWriteModel {
  songId: number;
  position: number;
  dateAdded?: Date;
  comments?: string;
}

export interface PlaylistPersistence {
  createPlaylist(name: string, description?: string): Promise<number>;
  addEntries(playlistId: number, entries: PlaylistEntryWriteModel[]): Promise<void>;
  clearEntries?(playlistId: number): Promise<void>;
}
