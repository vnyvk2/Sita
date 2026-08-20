import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/db';
import { getAllSongs } from '../../db/queries/songs';
import { playlistEntries, playlists } from '../../db/schema';
import logger from '../../logger';
import type { CanonicalTrackIdentity } from '../../metadata/identity/CanonicalTrackIdentity';
import { toCanonicalFromSong } from '../../metadata/identity/adapters/SongToCanonicalIdentity';
import { SpotifyApiClient } from '../api/SpotifyApiClient';
import type {
  CatalogResolution,
  SpotifyExportResult,
  SpotifyPlaylistExportPlan
} from '../api/types';
import { SpotifyTokenStore } from '../auth/SpotifyTokenStore';
import type { ValidatedExportRequest } from '../ipc/SpotifyExportValidator';
import { SpotifyPlaylistExportPlanner } from './SpotifyPlaylistExportPlanner';
import { SpotifyTrackCatalogSearcher } from './SpotifyTrackCatalogSearcher';

export class SpotifyPlaylistExportService {
  private readonly apiClient: SpotifyApiClient;
  private readonly catalogSearcher: SpotifyTrackCatalogSearcher;

  constructor(apiClient?: SpotifyApiClient) {
    this.apiClient = apiClient ?? new SpotifyApiClient();
    this.catalogSearcher = new SpotifyTrackCatalogSearcher(this.apiClient);
  }

  /**
   * Generates a preview export plan by loading the local Nora playlist, resolving its tracks
   * against the Spotify catalog, and planning decisions deterministically.
   * Strictly preserves 1..N positions even if individual local song records are missing.
   */
  public async generateExportPlan(
    playlistId: number,
    clientId?: string
  ): Promise<SpotifyPlaylistExportPlan> {
    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    const playlist = await db.query.playlists.findFirst({
      where: eq(playlists.id, playlistId),
      with: {
        entries: {
          orderBy: asc(playlistEntries.position)
        }
      }
    });

    if (!playlist) {
      throw new Error(`Playlist with ID ${playlistId} not found.`);
    }

    const songIds = playlist.entries.map((e) => e.songId);
    if (songIds.length === 0) {
      return SpotifyPlaylistExportPlanner.generatePlan({
        playlistId,
        playlistName: playlist.name,
        description: playlist.description || undefined,
        revision: playlist.updatedAt.toISOString(),
        tracks: [],
        resolutions: new Map()
      });
    }

    // Load full song records with artists and album relations
    const songsResult = await getAllSongs({ songIds, preserveIdOrder: true });
    const songsData = Array.isArray(songsResult) ? songsResult : songsResult.data || [];
    const songMap = new Map<number, (typeof songsData)[0]>();
    for (const s of songsData) {
      songMap.set(s.id, s);
    }

    const canonicalTracks: CanonicalTrackIdentity[] = [];
    const resolutions = new Map<number, CatalogResolution>();

    // Process every playlist entry 1..N without filtering out missing DB records
    for (let i = 0; i < playlist.entries.length; i++) {
      const entry = playlist.entries[i];
      const position = i + 1;
      const record = songMap.get(entry.songId);

      if (!record) {
        // Preserve position for missing local song records
        canonicalTracks.push({
          id: entry.songId,
          title: 'Unknown Song',
          artists: []
        });
        resolutions.set(position, {
          entryId: entry.id,
          songId: entry.songId,
          status: 'NOT_IN_CATALOG',
          diagnostics: ['LOCAL_SONG_NOT_FOUND']
        });
        continue;
      }

      const canonicalTrack = toCanonicalFromSong(record);
      canonicalTracks.push(canonicalTrack);

      const resolution = await this.catalogSearcher.resolveTrack(
        accessToken,
        canonicalTrack,
        entry.id
      );
      resolutions.set(position, resolution);
    }

    return SpotifyPlaylistExportPlanner.generatePlan({
      playlistId,
      playlistName: playlist.name,
      description: playlist.description || undefined,
      revision: playlist.updatedAt.toISOString(),
      tracks: canonicalTracks,
      resolutions
    });
  }

  /**
   * Executes remote Spotify playlist creation and batched sequential item additions.
   * Performs server-side re-resolution to prevent renderer tampering, guards against
   * revision races, and captures snapshots sequentially.
   */
  public async executeExport(
    validated: ValidatedExportRequest,
    clientId?: string
  ): Promise<SpotifyExportResult> {
    const activeClientId = clientId || process.env.MAIN_VITE_SPOTIFY_CLIENT_ID || '';
    const accessToken = await SpotifyTokenStore.getValidAccessToken(activeClientId);
    if (!accessToken) {
      throw new Error('Spotify account not connected or failed to retrieve valid access token.');
    }

    // Regenerate fresh authoritative plan server-side
    const freshPlan = await this.generateExportPlan(validated.playlistId, activeClientId);

    // Invariant: Verify playlist was not mutated during preparation
    if (freshPlan.revision !== validated.revision) {
      throw new Error(
        'Playlist changed while export was being prepared. Please refresh the preview.'
      );
    }

    if (freshPlan.statistics.exportableEntries === 0) {
      throw new Error('Cannot export playlist: no matching tracks found in Spotify catalog.');
    }

    // 1. Create remote Spotify playlist via POST /v1/me/playlists
    logger.info('Creating remote Spotify playlist...', {
      name: validated.playlistName,
      isPublic: validated.isPublic
    });

    const remotePlaylist = await this.apiClient.createPlaylist(accessToken, {
      name: validated.playlistName,
      description: validated.description,
      isPublic: validated.isPublic
    });

    const playlistId = remotePlaylist.id;
    const playlistUrl = `https://open.spotify.com/playlist/${playlistId}`;
    let currentSnapshotId = remotePlaylist.snapshot_id || remotePlaylist.snapshotId || '';

    // 2. Collect matched URIs preserving 1..N order and duplicate tracks
    const exportUris: string[] = [];
    for (const entry of freshPlan.entries) {
      if (entry.decision === 'EXPORT' && entry.resolution.spotifyUri) {
        exportUris.push(entry.resolution.spotifyUri);
      }
    }

    // 3. Slice URIs into chunks of <= 100 for batch addition
    const BATCH_SIZE = 100;
    const batches: string[][] = [];
    for (let i = 0; i < exportUris.length; i += BATCH_SIZE) {
      batches.push(exportUris.slice(i, i + BATCH_SIZE));
    }

    let completedBatches = 0;

    // 4. Sequential execution of batches with partial-failure capture
    for (let b = 0; b < batches.length; b++) {
      try {
        const batchUris = batches[b];
        const res = await this.apiClient.addPlaylistItems(accessToken, playlistId, batchUris);
        if (res.snapshot_id) {
          currentSnapshotId = res.snapshot_id;
        }
        completedBatches++;
      } catch (err) {
        logger.error('Failed to add batch of tracks to Spotify playlist', {
          playlistId,
          batchIndex: b,
          completedBatches,
          totalBatches: batches.length,
          error: (err as Error).message
        });

        return {
          status: 'PARTIAL_FAILURE',
          playlistId,
          playlistUrl,
          snapshotId: currentSnapshotId,
          totalBatches: batches.length,
          completedBatches,
          failedBatchIndex: b,
          error: (err as Error).message
        };
      }
    }

    logger.info('Successfully exported playlist to Spotify', {
      playlistId,
      playlistUrl,
      totalTracks: exportUris.length,
      snapshotId: currentSnapshotId
    });

    return {
      status: 'SUCCESS',
      playlistId,
      playlistUrl,
      snapshotId: currentSnapshotId,
      totalBatches: batches.length,
      completedBatches
    };
  }
}
