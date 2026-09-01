import getAllSongs from '../../core/getAllSongs';
import { toCanonicalFromSong } from '../../metadata/identity/adapters/SongToCanonicalIdentity';
import type { PlaylistImportPlan } from '../../playlistImport/models/PlaylistImportPlan';
import { SpotifyApiClient } from '../api/SpotifyApiClient';
import { SpotifyTokenStore } from '../auth/SpotifyTokenStore';
import { SpotifyPlaylistImportPlanner } from './SpotifyPlaylistImportPlanner';

export class SpotifyPlaylistImportService {
  private readonly apiClient: SpotifyApiClient;
  private readonly clientId: string;

  constructor(apiClient?: SpotifyApiClient, clientId?: string) {
    this.apiClient = apiClient ?? new SpotifyApiClient();
    this.clientId =
      clientId ??
      (typeof process !== 'undefined' && process.env.MAIN_VITE_SPOTIFY_CLIENT_ID
        ? process.env.MAIN_VITE_SPOTIFY_CLIENT_ID
        : (import.meta as unknown as { env?: { MAIN_VITE_SPOTIFY_CLIENT_ID?: string } }).env
            ?.MAIN_VITE_SPOTIFY_CLIENT_ID || '');
  }

  /**
   * Generates a preview PlaylistImportPlan by fetching remote playlist metadata and items, fetching
   * local library songs, and invoking the pure SpotifyPlaylistImportPlanner.
   */
  public async generateImportPlan(playlistId: string): Promise<PlaylistImportPlan> {
    const accessToken = await SpotifyTokenStore.getValidAccessToken(this.clientId);
    if (!accessToken) {
      throw new Error('Spotify is not connected or token could not be refreshed.');
    }

    // 1. Fetch remote playlist details & all items
    const playlistDetails = await this.apiClient.getPlaylist(accessToken, playlistId);
    const items = await this.apiClient.getAllPlaylistItems(accessToken, playlistId);

    // 2. Fetch local library songs & adapt to CanonicalTrackIdentity
    const localSongsResult = await getAllSongs();
    const songsList = localSongsResult?.data || [];
    const canonicalLocalSongs = songsList.map((s: unknown) => toCanonicalFromSong(s as never));

    // 3. Delegate to pure planner
    return SpotifyPlaylistImportPlanner.generatePlan(
      {
        id: playlistDetails.id,
        name: playlistDetails.name,
        description: playlistDetails.description,
        imageUrl: playlistDetails.imageUrl
      },
      items,
      canonicalLocalSongs
    );
  }
}
