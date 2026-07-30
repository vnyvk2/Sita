export interface PlaylistUndoPersistence {
  deletePlaylist(playlistId: number): Promise<void>;
}
